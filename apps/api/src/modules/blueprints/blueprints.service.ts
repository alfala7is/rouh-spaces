import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, CoordinationTemplate, TemplateState, TemplateRole } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

interface BlueprintChatRequest {
  message: string;
  templateId?: string;
  runId?: string;
  includeSuggestions?: boolean;
  systemPrompt?: string;
}

interface BlueprintMatch {
  templateId: string;
  name: string;
  description: string;
  category?: string | null;
  score: number;
  matchedKeywords: string[];
}

interface RunContextSummary {
  runId: string;
  status: string;
  currentState?: {
    id: string;
    name: string;
    type: string;
    description?: string | null;
  } | null;
  nextStates: Array<{ id: string; name: string; description?: string | null }>;
  participants: Array<{ id: string; role: string; userId?: string | null }>;
}

export interface BlueprintChatResponse {
  message: string;
  suggestedResponse: {
    text: string;
    actions: string[];
    blueprintMatches: BlueprintMatch[];
  };
  runContext?: RunContextSummary;
}

type TemplateWithRelations = CoordinationTemplate & {
  states: TemplateState[];
  roles: TemplateRole[];
};

type RunWithContext = Prisma.CoordinationRunGetPayload<{
  include: {
    template: { include: { states: true; roles: true } };
    currentState: true;
    states: { include: { state: true }, orderBy: { enteredAt: 'asc' } };
    participants: { include: { role: true } };
  };
}>;

@Injectable()
export class BlueprintsService {
  constructor(private readonly prisma: PrismaService) {}

  async chat(spaceId: string, input: BlueprintChatRequest): Promise<BlueprintChatResponse> {
    const message = input.message?.trim();
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    if (message.length > 2000) {
      throw new BadRequestException('Message is too long (max 2000 characters)');
    }

    const run = input.runId
      ? await this.prisma.coordinationRun.findFirst({
          where: { id: input.runId, spaceId },
          include: {
            template: { include: { states: true, roles: true } },
            currentState: true,
            states: { include: { state: true }, orderBy: { enteredAt: 'asc' } },
            participants: { include: { role: true } },
          },
        })
      : null;

    if (input.runId && !run) {
      throw new NotFoundException(`Run ${input.runId} not found in this space`);
    }

    let templates: TemplateWithRelations[] = [];

    if (run) {
      templates = [run.template];
    } else if (input.templateId) {
      const template = await this.prisma.coordinationTemplate.findFirst({
        where: { id: input.templateId, spaceId },
        include: { states: true, roles: true },
      });
      if (!template) {
        throw new NotFoundException(`Template ${input.templateId} not found in this space`);
      }
      templates = [template];
    } else {
      templates = await this.prisma.coordinationTemplate.findMany({
        where: { spaceId, isActive: true },
        include: { states: true, roles: true },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!templates.length) {
      return {
        message,
        suggestedResponse: {
          text:
            'No coordination blueprints exist in this space yet. Create a blueprint to model this coordination, then start a run to simulate it.',
          actions: ['Open Blueprint Builder', 'Import Demo Blueprint'],
          blueprintMatches: [],
        },
      };
    }

    const corpus = [message, input.systemPrompt].filter(Boolean).join(' ');
    const messageInfo = this.tokenize(corpus);
    const ranked = templates
      .map((template) => this.scoreTemplate(template, messageInfo))
      .sort((a, b) => b.score - a.score);

    const topMatches = ranked.slice(0, 3);
    const responseText = this.buildResponse(message, topMatches, run, input.systemPrompt);
    const actions = this.buildSuggestedActions(topMatches, run);

    const runSummary = run ? this.buildRunSummary(run, topMatches[0]?.template) : undefined;

    return {
      message,
      suggestedResponse: {
        text: responseText,
        actions,
        blueprintMatches: topMatches.map((match) => ({
          templateId: match.template.id,
          name: match.template.name,
          description: match.template.description,
          category: this.extractCategory(match.template),
          score: match.score,
          matchedKeywords: match.matchedKeywords,
        })),
      },
      runContext: runSummary,
    };
  }

  private tokenize(message: string) {
    const lower = message.toLowerCase();
    const tokens = lower.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
    return {
      lower,
      tokens: new Set(tokens),
    };
  }

  private extractCategory(template: TemplateWithRelations): string | null {
    const metadata = template.metadata as any;
    if (!metadata) return null;
    if (typeof metadata.category === 'string') return metadata.category;
    if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
      return metadata.tags[0];
    }
    return null;
  }

  private scoreTemplate(template: TemplateWithRelations, messageInfo: { lower: string; tokens: Set<string> }) {
    const keywords = this.collectTemplateKeywords(template);
    let score = 0;
    const matchedKeywords = new Set<string>();

    for (const keyword of keywords) {
      if (messageInfo.tokens.has(keyword) || messageInfo.lower.includes(keyword)) {
        matchedKeywords.add(keyword);
        score += keyword.length >= 6 ? 3 : 2;
      }
    }

    const metadata = template.metadata as any;
    if (metadata?.category && messageInfo.lower.includes(String(metadata.category).toLowerCase())) {
      matchedKeywords.add(String(metadata.category).toLowerCase());
      score += 4;
    }

    if (metadata?.audience && messageInfo.lower.includes(String(metadata.audience).toLowerCase())) {
      matchedKeywords.add(String(metadata.audience).toLowerCase());
      score += 2;
    }

    for (const role of template.roles) {
      const roleName = role.name.toLowerCase();
      if (messageInfo.lower.includes(roleName)) {
        matchedKeywords.add(roleName);
        score += 3;
      }
    }

    if (score === 0) {
      score = Math.min(5, Math.floor((template.description || '').length / 50));
    }

    return {
      template,
      score,
      matchedKeywords: Array.from(matchedKeywords).slice(0, 6),
    };
  }

  private collectTemplateKeywords(template: TemplateWithRelations): string[] {
    const keywords: string[] = [];
    const pushWords = (text?: string | null) => {
      if (!text) return;
      for (const token of text.split(/[^a-zA-Z0-9]+/)) {
        const normalized = token.toLowerCase();
        if (normalized.length >= 3) {
          keywords.push(normalized);
        }
      }
    };

    pushWords(template.name);
    pushWords(template.description);

    const metadata = template.metadata as any;
    if (metadata) {
      if (typeof metadata.category === 'string') {
        pushWords(metadata.category);
      }
      if (Array.isArray(metadata.tags)) {
        for (const tag of metadata.tags) {
          pushWords(String(tag));
        }
      }
      if (typeof metadata.useCase === 'string') {
        pushWords(metadata.useCase);
      }
    }

    for (const state of template.states) {
      pushWords(state.name);
      pushWords(state.description);
    }

    for (const role of template.roles) {
      pushWords(role.name);
      pushWords(role.description);
    }

    return Array.from(new Set(keywords)).slice(0, 60);
  }

  private buildResponse(
    message: string,
    matches: Array<{ template: TemplateWithRelations; score: number; matchedKeywords: string[] }>,
    run: RunWithContext | null,
    systemPrompt?: string,
  ): string {
    if (run) {
      const currentState = run.currentState || run.template.states.find((s) => s.id === run.currentStateId) || null;
      const nextStates = this.computeNextStates(run, currentState);
      const pieces: string[] = [];

      if (systemPrompt) {
        pieces.push('Persona instructions active for this chat: ' + systemPrompt.slice(0, 240));
      }

      pieces.push(
        `You're working inside the "${run.template.name}" blueprint. The current state is ${currentState ? `"${currentState.name}"` : 'not yet set'}.`,
      );

      if (currentState?.description) {
        pieces.push(currentState.description);
      }

      if (nextStates.length) {
        const list = nextStates.map((state) => `"${state.name}"`).join(', ');
        pieces.push(`Next possible step${nextStates.length > 1 ? 's are' : ' is'} ${list}.`);
      }

      if (run.participants.length) {
        const roles = run.participants
          .map((participant) => participant.role?.name)
          .filter(Boolean)
          .join(', ');
        if (roles) {
          pieces.push(`Participants currently active: ${roles}.`);
        }
      }

      if (matches[0]) {
        const keywords = matches[0].matchedKeywords.slice(0, 3);
        if (keywords.length) {
          pieces.push(`This response highlights the blueprint aspects matching "${keywords.join('", "')}".`);
        }
      }

      pieces.push('Document updates or trigger actions when this state completes to keep the run accurate.');
      return pieces.join(' ');
    }

    if (!matches.length || matches[0].score === 0) {
      return (
        'I could not align this question with an existing coordination blueprint. Try drafting a new blueprint, '
        + 'or expand your templates with clearer state descriptions so they cover topics like this.'
      );
    }

    const top = matches[0];
    const supporting = matches.slice(1);

    const sentences: string[] = [];

    if (systemPrompt) {
      sentences.push('Persona instructions active for this chat: ' + systemPrompt.slice(0, 240));
    }

    sentences.push(
      `The "${top.template.name}" blueprint fits this request${
        top.matchedKeywords.length ? ` (matched keywords: ${top.matchedKeywords.join(', ')})` : ''
      }.`,
    );

    if (top.template.description) {
      sentences.push(top.template.description);
    }

    if (supporting.length) {
      const also = supporting
        .filter((m) => m.score > 0)
        .map((m) => `"${m.template.name}"`)
        .join(', ');
      if (also) {
        sentences.push(`You might also consider ${also}.`);
      }
    }

    sentences.push('Launch a coordination run when you are ready, or refine the blueprint roles and states first.');
    return sentences.join(' ');
  }

  private buildSuggestedActions(
    matches: Array<{ template: TemplateWithRelations; score: number }>,
    run: RunWithContext | null,
  ): string[] {
    if (run) {
      const actions = ['Review run timeline'];
      if (run.status === 'active') {
        actions.push('Advance to next state');
        actions.push('Invite participant');
      }
      actions.push('Open ledger trail');
      return actions;
    }

    const actions = ['Open Blueprint Builder'];
    if (matches.length && matches[0].score > 0) {
      actions.push(`Start run with ${matches[0].template.name}`);
    } else {
      actions.push('Browse demo blueprints');
    }
    actions.push('Define participant identities');
    return actions;
  }

  private buildRunSummary(run: RunWithContext, templateOverride?: TemplateWithRelations) {
    const template = templateOverride || run.template;
    const currentState = run.currentState || template.states.find((s) => s.id === run.currentStateId) || null;
    const nextStates = this.computeNextStates(run, currentState);

    return {
      runId: run.id,
      status: run.status,
      currentState: currentState
        ? {
            id: currentState.id,
            name: currentState.name,
            type: currentState.type,
            description: currentState.description,
          }
        : null,
      nextStates: nextStates.map((state) => ({
        id: state.id,
        name: state.name,
        description: state.description,
      })),
      participants: run.participants.map((participant) => ({
        id: participant.id,
        role: participant.role?.name || 'unknown',
        userId: participant.userId,
      })),
    } satisfies RunContextSummary;
  }

  private computeNextStates(run: RunWithContext, currentState: TemplateState | null) {
    if (!currentState) {
      return [] as TemplateState[];
    }

    const transitions = currentState.transitions as any;
    if (Array.isArray(transitions) && transitions.length) {
      const templateStates = new Map(run.template.states.map((state) => [state.id, state] as const));
      return transitions
        .map((transition: any) => templateStates.get(String(transition.to)))
        .filter((state): state is TemplateState => Boolean(state));
    }

    const ordered = [...run.template.states].sort((a, b) => a.sequence - b.sequence);
    const currentIndex = ordered.findIndex((state) => state.id === currentState.id);
    if (currentIndex >= 0 && currentIndex < ordered.length - 1) {
      return [ordered[currentIndex + 1]];
    }

    return [] as TemplateState[];
  }
}
