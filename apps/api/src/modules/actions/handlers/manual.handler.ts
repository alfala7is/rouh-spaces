import { Injectable } from '@nestjs/common';
import { ActionExecutionContext, ExecutionResult } from '../types/execution.types';
import { BaseActionHandler } from './base.handler';

@Injectable()
export class ManualTaskHandler extends BaseActionHandler {
  name = 'manual_task_handler';
  type = 'manual' as const;
  description = 'Creates manual tasks for human operators when no automated integration is available';
  supportedActionTypes = ['contact', 'inquiry', 'hold', 'book', 'intro', 'order', 'schedule', 'submit'];

  async execute(context: ActionExecutionContext): Promise<ExecutionResult> {
    this.logger.log(`Creating manual task for action ${context.action.id}`);

    try {
      const itemData = this.extractItemData(context.item);
      const parameters = context.parameters || {};

      // Generate task details
      const taskInstructions = this.generateTaskInstructions(
        context.action.type,
        itemData,
        parameters
      );

      const taskReference = this.generateExternalReference('task');

      // Calculate urgency based on action type
      const urgency = this.calculateTaskUrgency(context.action.type, parameters);

      // Estimated completion time
      const estimatedCompletionTime = this.getEstimatedCompletionTime(context.action.type);

      // In a real implementation, this would create a task in a task management system
      const taskData = {
        task_id: taskReference,
        action_id: context.action.id,
        action_type: context.action.type,
        urgency,
        estimated_completion: estimatedCompletionTime,
        instructions: taskInstructions,
        item_data: itemData,
        parameters: parameters,
        created_at: new Date().toISOString(),
        deadline: new Date(Date.now() + estimatedCompletionTime * 1000).toISOString(),
      };

      this.logger.log(`Manual task created:`, taskData);

      // Return pending result with task information
      return this.createPendingResult({
        externalReference: taskReference,
        externalData: taskData,
        receiptData: {
          provider: itemData.name || itemData.title || 'Provider',
          task_id: taskReference,
          status: 'Task assigned to operator',
          action_type: context.action.type,
          urgency,
          estimated_completion: `${Math.round(estimatedCompletionTime / 60)} minutes`,
          instructions: taskInstructions.summary,
        },
        providerName: itemData.name || itemData.title || 'Provider',
      });

    } catch (error) {
      this.logger.error(`Manual task creation failed:`, error);
      return this.createFailureResult(`Task creation failed: ${(error as Error).message}`, false);
    }
  }

  private generateTaskInstructions(
    actionType: string,
    itemData: any,
    parameters: any
  ): {
    summary: string;
    detailed_steps: string[];
    contact_info: any;
    user_info: any;
  } {
    const providerName = itemData.name || itemData.title || 'Provider';
    const userInfo = {
      name: parameters.user_name || parameters.customer_name || 'Rouh User',
      email: parameters.user_email || parameters.customer_email,
      phone: parameters.user_phone || parameters.customer_phone,
    };

    const contactInfo = {
      email: itemData.email || itemData.contact_email,
      phone: itemData.phone || itemData.contact_phone,
      address: itemData.address,
      website: itemData.website,
    };

    switch (actionType) {
      case 'order':
        return {
          summary: `Place order with ${providerName} for customer ${userInfo.name}`,
          detailed_steps: [
            `Contact ${providerName} using provided contact information`,
            `Place order for: ${parameters.items?.map((item: any) => `${item.quantity}x ${item.name}`).join(', ') || 'specified items'}`,
            `Provide customer details: ${userInfo.name}, ${userInfo.phone}`,
            `Confirm pickup/delivery time: ${parameters.pickup_time || 'ASAP'}`,
            `Get order confirmation number`,
            `Update action status with confirmation details`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };

      case 'book':
        return {
          summary: `Book ${itemData.title || 'service'} with ${providerName} for ${userInfo.name}`,
          detailed_steps: [
            `Contact ${providerName} to check availability`,
            `Book ${itemData.title || 'service'} for ${userInfo.name}`,
            `Preferred date/time: ${parameters.preferred_date || 'flexible'} ${parameters.preferred_time || ''}`,
            `Party size: ${parameters.party_size || '1'} people`,
            `Special requirements: ${parameters.special_requirements || 'None'}`,
            `Get booking confirmation`,
            `Send confirmation details to customer`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };

      case 'schedule':
        return {
          summary: `Schedule meeting between ${userInfo.name} and ${providerName}`,
          detailed_steps: [
            `Contact ${providerName} to discuss meeting availability`,
            `Topic: ${parameters.meeting_topic || 'General meeting'}`,
            `Proposed time: ${parameters.preferred_date || 'flexible'} ${parameters.preferred_time || ''}`,
            `Duration: ${parameters.duration || '30 minutes'}`,
            `Meeting type: ${parameters.meeting_type || 'In-person/Video call'}`,
            `Coordinate between both parties`,
            `Send calendar invites once confirmed`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };

      case 'contact':
        return {
          summary: `Facilitate contact between ${userInfo.name} and ${providerName}`,
          detailed_steps: [
            `Reach out to ${providerName} on behalf of ${userInfo.name}`,
            `Message: ${parameters.message || 'Customer would like to get in touch'}`,
            `Provide customer contact details: ${userInfo.email}, ${userInfo.phone}`,
            `Ask for best way to connect the two parties`,
            `Facilitate introduction if needed`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };

      case 'inquiry':
        return {
          summary: `Handle inquiry about ${itemData.title || 'service'} from ${userInfo.name}`,
          detailed_steps: [
            `Contact ${providerName} about customer inquiry`,
            `Inquiry about: ${itemData.title || itemData.name || 'their service'}`,
            `Customer question: ${parameters.inquiry_message || parameters.message || 'General inquiry'}`,
            `Get detailed information/pricing/availability`,
            `Relay information back to customer`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };

      case 'hold':
        return {
          summary: `Place hold on ${itemData.title || 'item'} for ${userInfo.name}`,
          detailed_steps: [
            `Contact ${providerName} to place hold`,
            `Item: ${itemData.title || itemData.name}`,
            `Hold duration: ${parameters.hold_duration || '24 hours'}`,
            `Customer: ${userInfo.name}, ${userInfo.phone}`,
            `Get hold confirmation and reference number`,
            `Inform customer of hold details and expiration`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };

      case 'intro':
        return {
          summary: `Arrange introduction between ${userInfo.name} and ${providerName}`,
          detailed_steps: [
            `Contact ${providerName} about introduction request`,
            `Purpose: ${parameters.intro_purpose || 'General introduction'}`,
            `Background on ${userInfo.name}: ${parameters.user_background || 'Rouh user'}`,
            `Check ${providerName}'s interest in meeting`,
            `If both parties agree, facilitate introduction`,
            `Suggest meeting format and timing`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };

      case 'submit':
        return {
          summary: `Submit information/application to ${providerName} for ${userInfo.name}`,
          detailed_steps: [
            `Prepare submission for ${providerName}`,
            `Submit data: ${JSON.stringify(parameters.form_data || parameters.submission_data || {})}`,
            `Include customer contact: ${userInfo.name}, ${userInfo.email}`,
            `Get submission confirmation`,
            `Follow up on processing timeline`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };

      default:
        return {
          summary: `Handle ${actionType} request for ${userInfo.name} with ${providerName}`,
          detailed_steps: [
            `Review ${actionType} request details`,
            `Contact ${providerName} using available contact information`,
            `Process request according to customer requirements`,
            `Provide confirmation and next steps to customer`,
          ],
          contact_info: contactInfo,
          user_info: userInfo,
        };
    }
  }

  private calculateTaskUrgency(actionType: string, parameters: any): 'low' | 'medium' | 'high' | 'urgent' {
    // Check for explicit urgency in parameters
    if (parameters.urgency) {
      return parameters.urgency;
    }

    // Determine urgency based on action type and context
    if (actionType === 'order') {
      const pickupTime = parameters.pickup_time;
      if (pickupTime && pickupTime.toLowerCase().includes('asap')) {
        return 'urgent';
      }
      return 'high';
    }

    if (actionType === 'book' || actionType === 'schedule') {
      const date = parameters.preferred_date;
      if (date) {
        const requestedDate = new Date(date);
        const today = new Date();
        const daysDiff = (requestedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

        if (daysDiff <= 1) return 'urgent';
        if (daysDiff <= 3) return 'high';
        if (daysDiff <= 7) return 'medium';
      }
      return 'medium';
    }

    if (actionType === 'hold') {
      return 'high'; // Time-sensitive
    }

    // Default urgency for other action types
    return 'medium';
  }

  private getEstimatedCompletionTime(actionType: string): number {
    // Return time in seconds
    const timeEstimates: Record<string, number> = {
      contact: 15 * 60, // 15 minutes
      inquiry: 20 * 60, // 20 minutes
      hold: 10 * 60,    // 10 minutes
      book: 30 * 60,    // 30 minutes
      intro: 25 * 60,   // 25 minutes
      order: 15 * 60,   // 15 minutes
      schedule: 30 * 60, // 30 minutes
      submit: 20 * 60,  // 20 minutes
    };

    return timeEstimates[actionType] || 20 * 60; // Default 20 minutes
  }

  async estimateExecutionTime(context: ActionExecutionContext): Promise<number> {
    return this.getEstimatedCompletionTime(context.action.type);
  }
}