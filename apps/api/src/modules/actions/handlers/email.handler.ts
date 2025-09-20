import { Injectable } from '@nestjs/common';
import { ActionExecutionContext, ExecutionResult } from '../types/execution.types';
import { BaseActionHandler } from './base.handler';

@Injectable()
export class EmailHandler extends BaseActionHandler {
  name = 'email_handler';
  type = 'email' as const;
  description = 'Sends structured emails for various action types';
  supportedActionTypes = ['contact', 'inquiry', 'book', 'schedule', 'submit'];

  async execute(context: ActionExecutionContext): Promise<ExecutionResult> {
    this.logger.log(`Executing email handler for action ${context.action.id}`);

    try {
      const itemData = this.extractItemData(context.item);
      const parameters = context.parameters || {};

      // Extract contact information
      const recipientEmail = this.getRecipientEmail(itemData, parameters);
      if (!recipientEmail) {
        return this.createFailureResult('No email address found for this provider');
      }

      // Generate email content based on action type
      const emailContent = this.generateEmailContent(context, itemData, parameters);

      // Simulate email sending (in production, this would use a real email service)
      const emailRef = await this.sendEmail(recipientEmail, emailContent);

      const receiptData = {
        provider: itemData.name || itemData.title || 'Provider',
        action_type: context.action.type,
        email_sent_to: recipientEmail,
        subject: emailContent.subject,
        status: 'Email sent successfully',
        confirmation_method: 'Email response expected within 24 hours',
        sent_at: new Date().toISOString(),
      };

      return this.createSuccessResult({
        externalReference: emailRef,
        externalData: {
          email_sent_to: recipientEmail,
          subject: emailContent.subject,
          sent_at: new Date().toISOString(),
        },
        receiptData,
        providerName: itemData.name || itemData.title || 'Provider',
      });

    } catch (error) {
      this.logger.error(`Email handler execution failed:`, error);
      return this.createFailureResult(`Email sending failed: ${(error as Error).message}`, true);
    }
  }

  private getRecipientEmail(itemData: any, parameters: any): string | null {
    return parameters.recipient_email ||
           itemData.email ||
           itemData.contact_email ||
           itemData.support_email ||
           null;
  }

  private generateEmailContent(
    context: ActionExecutionContext,
    itemData: any,
    parameters: any
  ): { subject: string; body: string } {
    const actionType = context.action.type;
    const providerName = itemData.name || itemData.title || 'Provider';
    const userInfo = this.getUserInfo(parameters);

    switch (actionType) {
      case 'contact':
        return this.generateContactEmail(providerName, userInfo, parameters);

      case 'inquiry':
        return this.generateInquiryEmail(providerName, userInfo, parameters, itemData);

      case 'book':
        return this.generateBookingEmail(providerName, userInfo, parameters, itemData);

      case 'schedule':
        return this.generateSchedulingEmail(providerName, userInfo, parameters, itemData);

      case 'submit':
        return this.generateSubmissionEmail(providerName, userInfo, parameters, itemData);

      default:
        return this.generateGenericEmail(actionType, providerName, userInfo, parameters);
    }
  }

  private getUserInfo(parameters: any): any {
    return {
      name: parameters.user_name || parameters.customer_name || 'Rouh User',
      email: parameters.user_email || parameters.customer_email || 'user@rouh.com',
      phone: parameters.user_phone || parameters.customer_phone || 'Not provided',
    };
  }

  private generateContactEmail(
    providerName: string,
    userInfo: any,
    parameters: any
  ): { subject: string; body: string } {
    return {
      subject: `Contact Request from ${userInfo.name} via Rouh Spaces`,
      body: `
Hello ${providerName},

You have received a new contact request through Rouh Spaces.

Customer Information:
- Name: ${userInfo.name}
- Email: ${userInfo.email}
- Phone: ${userInfo.phone}

Message:
${parameters.message || 'The customer would like to get in touch with you.'}

Please respond to this inquiry as soon as possible.

Best regards,
Rouh Spaces Team

---
Request ID: ${parameters.action_id || 'N/A'}
Sent via Rouh Spaces (rouh.com)
      `.trim(),
    };
  }

  private generateInquiryEmail(
    providerName: string,
    userInfo: any,
    parameters: any,
    itemData: any
  ): { subject: string; body: string } {
    return {
      subject: `Inquiry about ${itemData.title || itemData.name || 'your service'} from ${userInfo.name}`,
      body: `
Hello ${providerName},

You have received a new inquiry through Rouh Spaces.

Customer Information:
- Name: ${userInfo.name}
- Email: ${userInfo.email}
- Phone: ${userInfo.phone}

Inquiry Details:
Item/Service: ${itemData.title || itemData.name || 'Your service'}
${itemData.description ? `Description: ${itemData.description}` : ''}

Customer Message:
${parameters.inquiry_message || parameters.message || 'The customer is interested in learning more about this item/service.'}

Please respond with availability, pricing, or any other relevant information.

Best regards,
Rouh Spaces Team

---
Inquiry ID: ${parameters.action_id || 'N/A'}
Sent via Rouh Spaces (rouh.com)
      `.trim(),
    };
  }

  private generateBookingEmail(
    providerName: string,
    userInfo: any,
    parameters: any,
    itemData: any
  ): { subject: string; body: string } {
    return {
      subject: `Booking Request for ${itemData.title || itemData.name || 'your service'} from ${userInfo.name}`,
      body: `
Hello ${providerName},

You have received a new booking request through Rouh Spaces.

Customer Information:
- Name: ${userInfo.name}
- Email: ${userInfo.email}
- Phone: ${userInfo.phone}

Booking Details:
Service: ${itemData.title || itemData.name || 'Your service'}
${parameters.preferred_date ? `Preferred Date: ${parameters.preferred_date}` : ''}
${parameters.preferred_time ? `Preferred Time: ${parameters.preferred_time}` : ''}
${parameters.duration ? `Duration: ${parameters.duration}` : ''}
${parameters.party_size ? `Party Size: ${parameters.party_size} people` : ''}

Special Requirements:
${parameters.special_requirements || parameters.notes || 'None specified'}

Please confirm this booking and provide any additional details the customer may need.

Best regards,
Rouh Spaces Team

---
Booking ID: ${parameters.action_id || 'N/A'}
Sent via Rouh Spaces (rouh.com)
      `.trim(),
    };
  }

  private generateSchedulingEmail(
    providerName: string,
    userInfo: any,
    parameters: any,
    itemData: any
  ): { subject: string; body: string } {
    return {
      subject: `Meeting Request with ${providerName} from ${userInfo.name}`,
      body: `
Hello ${providerName},

You have received a new meeting request through Rouh Spaces.

Requester Information:
- Name: ${userInfo.name}
- Email: ${userInfo.email}
- Phone: ${userInfo.phone}

Meeting Details:
${parameters.meeting_topic ? `Topic: ${parameters.meeting_topic}` : ''}
${parameters.preferred_date ? `Preferred Date: ${parameters.preferred_date}` : ''}
${parameters.preferred_time ? `Preferred Time: ${parameters.preferred_time}` : ''}
${parameters.duration ? `Estimated Duration: ${parameters.duration}` : ''}
${parameters.meeting_type ? `Meeting Type: ${parameters.meeting_type}` : ''}

Additional Information:
${parameters.meeting_notes || parameters.message || 'No additional information provided'}

Please respond with your availability and any meeting details.

Best regards,
Rouh Spaces Team

---
Meeting Request ID: ${parameters.action_id || 'N/A'}
Sent via Rouh Spaces (rouh.com)
      `.trim(),
    };
  }

  private generateSubmissionEmail(
    providerName: string,
    userInfo: any,
    parameters: any,
    itemData: any
  ): { subject: string; body: string } {
    return {
      subject: `Form Submission from ${userInfo.name} via Rouh Spaces`,
      body: `
Hello ${providerName},

You have received a new form submission through Rouh Spaces.

Submitter Information:
- Name: ${userInfo.name}
- Email: ${userInfo.email}
- Phone: ${userInfo.phone}

Submission Details:
${parameters.form_data ? this.formatFormData(parameters.form_data) : ''}

${parameters.additional_notes ? `Additional Notes:\n${parameters.additional_notes}` : ''}

Please review the submission and respond as appropriate.

Best regards,
Rouh Spaces Team

---
Submission ID: ${parameters.action_id || 'N/A'}
Sent via Rouh Spaces (rouh.com)
      `.trim(),
    };
  }

  private generateGenericEmail(
    actionType: string,
    providerName: string,
    userInfo: any,
    parameters: any
  ): { subject: string; body: string } {
    return {
      subject: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} Request from ${userInfo.name}`,
      body: `
Hello ${providerName},

You have received a new ${actionType} request through Rouh Spaces.

Customer Information:
- Name: ${userInfo.name}
- Email: ${userInfo.email}
- Phone: ${userInfo.phone}

Request Details:
${parameters.message || `The customer has submitted a ${actionType} request.`}

Please respond to this request as soon as possible.

Best regards,
Rouh Spaces Team

---
Request ID: ${parameters.action_id || 'N/A'}
Sent via Rouh Spaces (rouh.com)
      `.trim(),
    };
  }

  private formatFormData(formData: any): string {
    if (typeof formData === 'object') {
      return Object.entries(formData)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    }
    return String(formData);
  }

  private async sendEmail(to: string, content: { subject: string; body: string }): Promise<string> {
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In production, this would use a real email service like SendGrid, AWS SES, etc.
    this.logger.log(`Sending email to ${to} with subject: ${content.subject}`);

    // Return a mock email reference
    return this.generateExternalReference('email');
  }
}