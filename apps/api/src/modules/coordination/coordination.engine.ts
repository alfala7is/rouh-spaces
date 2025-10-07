import { Injectable, Logger } from '@nestjs/common';
import {
  CoordinationRun,
  RunParticipant,
  RunState,
  CoordinationTemplate,
  TemplateState,
  TemplateRole,
} from '@prisma/client';

interface StateConfig {
  name: string;
  type: string;
  roles?: string[];
  slots?: {
    name: string;
    type: string;
    required?: boolean;
    roles?: string[];
  }[];
  transitions?: {
    to: string;
    condition?: any;
    roles?: string[];
  }[];
  timeout?: number;
  metadata?: any;
}

interface ValidationContext {
  run: CoordinationRun & {
    template: CoordinationTemplate & {
      states: TemplateState[];
      roles: TemplateRole[];
    };
    currentState: TemplateState;
  };
  participant: RunParticipant & { role: TemplateRole };
  currentState: TemplateState;
  targetStateId?: string;
  slotData?: any;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  nextState?: TemplateState;
}

@Injectable()
export class CoordinationEngine {
  private readonly logger = new Logger(CoordinationEngine.name);

  private readonly STATE_TYPES = {
    EXPRESS: 'collect',
    EXPLORE: 'negotiate',
    COMMIT: 'commit',
    EVIDENCE: 'evidence',
    CONFIRM: 'signoff',
  };

  async validateStateTransition(context: ValidationContext): Promise<ValidationResult> {
    const { run, participant, currentState, targetStateId, slotData } = context;

    try {
      const template = run.template;
      const role = participant.role;

      if (!this.canParticipantTransition(currentState, role)) {
        return {
          isValid: false,
          error: `Role ${role.name} cannot transition from state ${currentState.name}`,
        };
      }

      const slotValidation = this.validateSlotData(currentState, slotData, role);
      if (!slotValidation.isValid) {
        return slotValidation;
      }

      let nextState: TemplateState | null = null;

      if (targetStateId) {
        nextState = template.states.find((s) => s.id === targetStateId) || null;
        if (!nextState) {
          return {
            isValid: false,
            error: `Target state not found: ${targetStateId}`,
          };
        }
      } else {
        nextState = this.determineNextState(currentState, template.states, slotData);
      }

      if (!nextState) {
        return {
          isValid: false,
          error: 'No valid transition available from current state',
        };
      }

      const transitionValidation = this.validateTransition(
        currentState,
        nextState,
        role,
        slotData,
      );

      if (!transitionValidation.isValid) {
        return transitionValidation;
      }

      return {
        isValid: true,
        nextState,
      };
    } catch (error: any) {
      this.logger.error('State transition validation error:', error);
      return {
        isValid: false,
        error: 'Internal validation error',
      };
    }
  }

  loadTemplate(template: CoordinationTemplate & { states: TemplateState[] }): TemplateState[] {
    if (!template.states || !Array.isArray(template.states)) {
      throw new Error('Invalid template: missing states array');
    }

    return template.states;
  }

  validateTemplate(template: CoordinationTemplate & { states: TemplateState[] }): boolean {
    const states = this.loadTemplate(template);

    if (states.length === 0) {
      return false;
    }

    const stateIds = new Set(states.map((s) => s.id));
    const transitions = states.flatMap(s => {
      const trans = s.transitions as any;
      return trans && Array.isArray(trans) ? trans : [];
    });

    for (const transition of transitions) {
      if (transition.to && !stateIds.has(transition.to)) {
        this.logger.error(`Invalid transition: state ${transition.to} not found in template`);
        return false;
      }
    }

    const hasCollectState = states.some((s) => s.type === 'collect');
    if (!hasCollectState) {
      this.logger.warn('Template missing collect state');
    }

    return true;
  }

  private findStateById(states: TemplateState[], stateId: string): TemplateState | null {
    return states.find((s) => s.id === stateId) || null;
  }

  private canParticipantTransition(state: TemplateState, role: TemplateRole): boolean {
    const allowedRoles = state.allowedRoles as string[];
    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    return allowedRoles.includes(role.name);
  }

  private validateSlotData(
    state: TemplateState,
    slotData: any,
    role: TemplateRole,
  ): ValidationResult {
    const requiredSlots = state.requiredSlots as string[];
    if (!requiredSlots || requiredSlots.length === 0) {
      return { isValid: true };
    }

    for (const slotName of requiredSlots) {
      if (!slotData || slotData[slotName] === undefined) {
        return {
          isValid: false,
          error: `Required slot data missing: ${slotName}`,
        };
      }
    }

    return { isValid: true };
  }

  private validateSlotType(name: string, value: any, type: string): ValidationResult {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            isValid: false,
            error: `Slot ${name} must be a string`,
          };
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          return {
            isValid: false,
            error: `Slot ${name} must be a number`,
          };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            isValid: false,
            error: `Slot ${name} must be a boolean`,
          };
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null) {
          return {
            isValid: false,
            error: `Slot ${name} must be an object`,
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            isValid: false,
            error: `Slot ${name} must be an array`,
          };
        }
        break;

      case 'date':
        if (!(value instanceof Date || typeof value === 'string')) {
          return {
            isValid: false,
            error: `Slot ${name} must be a date`,
          };
        }
        break;
    }

    return { isValid: true };
  }

  private determineNextState(
    currentState: TemplateState,
    allStates: TemplateState[],
    slotData: any,
  ): TemplateState | null {
    const transitions = currentState.transitions as any;
    if (!transitions || !Array.isArray(transitions) || transitions.length === 0) {
      const nextSequence = currentState.sequence + 1;
      return allStates.find((s) => s.sequence === nextSequence) || null;
    }

    for (const transition of transitions) {
      if (this.evaluateCondition(transition.condition, slotData)) {
        const nextState = allStates.find((s) => s.id === transition.to);
        if (nextState) {
          return nextState;
        }
      }
    }

    const defaultTransition = transitions.find((t: any) => !t.condition);
    if (defaultTransition) {
      return allStates.find((s) => s.id === defaultTransition.to) || null;
    }

    return null;
  }

  private evaluateCondition(condition: any, slotData: any): boolean {
    if (!condition) {
      return true;
    }

    if (typeof condition === 'boolean') {
      return condition;
    }

    if (condition.type === 'slotEquals') {
      return slotData && slotData[condition.slot] === condition.value;
    }

    if (condition.type === 'slotExists') {
      return slotData && slotData[condition.slot] !== undefined;
    }

    if (condition.type === 'and') {
      return condition.conditions.every((c: any) => this.evaluateCondition(c, slotData));
    }

    if (condition.type === 'or') {
      return condition.conditions.some((c: any) => this.evaluateCondition(c, slotData));
    }

    if (condition.type === 'not') {
      return !this.evaluateCondition(condition.condition, slotData);
    }

    return false;
  }

  private validateTransition(
    fromState: TemplateState,
    toState: TemplateState,
    role: TemplateRole,
    slotData: any,
  ): ValidationResult {
    const transitions = fromState.transitions as any;
    if (!transitions) {
      return { isValid: true };
    }

    const transition = transitions.find((t: any) => t.to === toState.id);

    if (!transition) {
      if (toState.sequence === fromState.sequence + 1) {
        return { isValid: true };
      }
      return {
        isValid: false,
        error: `No transition defined from ${fromState.name} to ${toState.name}`,
      };
    }

    if (transition.roles && !transition.roles.includes(role.name)) {
      return {
        isValid: false,
        error: `Role ${role.name} cannot make transition from ${fromState.name} to ${toState.name}`,
      };
    }

    if (transition.condition && !this.evaluateCondition(transition.condition, slotData)) {
      return {
        isValid: false,
        error: 'Transition condition not met',
      };
    }

    return { isValid: true };
  }

  checkTimeouts(state: RunState, templateState: TemplateState): boolean {
    if (!templateState.timeoutMinutes) {
      return false;
    }

    const now = new Date();
    const stateAge = now.getTime() - state.enteredAt.getTime();
    const timeoutMs = templateState.timeoutMinutes * 60 * 1000;

    return stateAge > timeoutMs;
  }

  generateActionForTransition(
    fromState: TemplateState,
    toState: TemplateState,
    participant: RunParticipant & { role: TemplateRole },
    slotData: any,
  ): any {
    return {
      type: `coordination.transition.${fromState.type}_to_${toState.type}`,
      parameters: {
        fromStateId: fromState.id,
        toStateId: toState.id,
        participantId: participant.id,
        roleId: participant.roleId,
        slotData,
        timestamp: new Date(),
      },
    };
  }

  getStateProgress(states: RunState[], template: CoordinationTemplate & { states: TemplateState[] }): number {
    if (!states || states.length === 0) {
      return 0;
    }

    const templateStates = template.states;
    const totalStates = templateStates.length;
    const completedStates = states.filter((s) => s.exitedAt).length;

    return Math.round((completedStates / totalStates) * 100);
  }

  getAvailableActions(
    state: TemplateState,
    role: TemplateRole,
  ): { action: string; description: string }[] {
    const actions: { action: string; description: string }[] = [];
    const allowedRoles = state.allowedRoles as string[];

    if (allowedRoles && !allowedRoles.includes(role.name)) {
      return actions;
    }

    switch (state.type) {
      case 'collect':
        actions.push({
          action: 'express_need',
          description: 'Express your need or requirement',
        });
        break;

      case 'negotiate':
        actions.push({
          action: 'explore_options',
          description: 'Explore available options and possibilities',
        });
        if (role.name === 'provider') {
          actions.push({
            action: 'propose_solution',
            description: 'Propose a solution or offering',
          });
        }
        break;

      case 'commit':
        if (role.name === 'requester' || role.name === 'provider') {
          actions.push({
            action: 'commit',
            description: 'Commit to the agreement',
          });
          actions.push({
            action: 'reject',
            description: 'Reject the proposal',
          });
        }
        break;

      case 'evidence':
        if (role.name === 'provider') {
          actions.push({
            action: 'provide_evidence',
            description: 'Provide evidence of completion',
          });
        }
        if (role.name === 'requester') {
          actions.push({
            action: 'review_evidence',
            description: 'Review the provided evidence',
          });
        }
        break;

      case 'signoff':
        if (role.name === 'requester') {
          actions.push({
            action: 'confirm_completion',
            description: 'Confirm successful completion',
          });
          actions.push({
            action: 'dispute',
            description: 'Dispute the completion',
          });
        }
        break;
    }

    return actions;
  }

  canRoleAccessState(state: TemplateState, role: TemplateRole): boolean {
    const allowedRoles = state.allowedRoles as string[];
    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    return allowedRoles.includes(role.name) || role.name === 'admin' || role.name === 'observer';
  }
}