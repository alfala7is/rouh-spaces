import { Injectable } from '@nestjs/common';
import { ActionExecutionContext, ExecutionResult } from '../types/execution.types';
import { BaseActionHandler } from './base.handler';

@Injectable()
export class CafeOrderHandler extends BaseActionHandler {
  name = 'cafe_order_handler';
  type = 'api' as const;
  description = 'Handles order placement for café items';
  supportedActionTypes = ['order'];

  async execute(context: ActionExecutionContext): Promise<ExecutionResult> {
    this.logger.log(`Executing café order for action ${context.action.id}`);

    try {
      const itemData = this.extractItemData(context.item);
      const parameters = context.parameters || {};

      // Validate required parameters
      if (!parameters.items || !Array.isArray(parameters.items)) {
        return this.createFailureResult('No items specified in order parameters');
      }

      // Extract café information from item data
      const cafeName = itemData.name || itemData.title || 'Unknown Café';
      const cafeEmail = itemData.email;
      const cafePhone = itemData.phone;
      const cafeOrderSystem = itemData.order_system; // e.g., 'square', 'toast', 'custom'

      // Calculate order total
      const orderTotal = this.calculateOrderTotal(parameters.items);

      // Determine execution method based on available integration
      if (cafeOrderSystem === 'square' && this.hasSquareIntegration(itemData)) {
        return await this.executeSquareOrder(context, parameters, orderTotal, cafeName);
      } else if (cafeOrderSystem === 'toast' && this.hasToastIntegration(itemData)) {
        return await this.executeToastOrder(context, parameters, orderTotal, cafeName);
      } else if (cafeEmail) {
        return await this.executeEmailOrder(context, parameters, orderTotal, cafeName, cafeEmail);
      } else if (cafePhone) {
        return await this.executeSMSOrder(context, parameters, orderTotal, cafeName, cafePhone);
      } else {
        return await this.executeManualOrder(context, parameters, orderTotal, cafeName);
      }

    } catch (error) {
      this.logger.error(`Café order execution failed:`, error);
      return this.createFailureResult(`Order execution failed: ${(error as Error).message}`, true);
    }
  }

  private calculateOrderTotal(items: any[]): number {
    return items.reduce((total, item) => {
      const price = parseFloat(item.price || '0');
      const quantity = parseInt(item.quantity || '1');
      return total + (price * quantity);
    }, 0);
  }

  private hasSquareIntegration(itemData: any): boolean {
    return !!(itemData.square_application_id && itemData.square_access_token);
  }

  private hasToastIntegration(itemData: any): boolean {
    return !!(itemData.toast_restaurant_guid && itemData.toast_access_token);
  }

  private async executeSquareOrder(
    context: ActionExecutionContext,
    parameters: any,
    total: number,
    cafeName: string
  ): Promise<ExecutionResult> {
    this.logger.log('Executing Square POS order');

    // This would integrate with Square API in a real implementation
    const mockSquareOrderId = this.generateExternalReference('sq_order');
    const orderNumber = `SQ-${Date.now().toString().slice(-6)}`;

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return this.createSuccessResult({
      externalReference: mockSquareOrderId,
      externalData: {
        square_order_id: mockSquareOrderId,
        order_number: orderNumber,
        payment_status: 'paid',
      },
      receiptData: {
        provider: cafeName,
        order_number: orderNumber,
        items: parameters.items,
        total: this.formatCurrency(total),
        pickup_time: parameters.pickup_time || '15 minutes',
        pickup_location: 'Main counter',
      },
      providerName: cafeName,
      totalAmount: total,
      currency: 'USD',
    });
  }

  private async executeToastOrder(
    context: ActionExecutionContext,
    parameters: any,
    total: number,
    cafeName: string
  ): Promise<ExecutionResult> {
    this.logger.log('Executing Toast POS order');

    const mockToastOrderId = this.generateExternalReference('toast_order');
    const orderNumber = `TO-${Date.now().toString().slice(-6)}`;

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    return this.createSuccessResult({
      externalReference: mockToastOrderId,
      externalData: {
        toast_order_id: mockToastOrderId,
        order_number: orderNumber,
        status: 'submitted',
      },
      receiptData: {
        provider: cafeName,
        order_number: orderNumber,
        items: parameters.items,
        total: this.formatCurrency(total),
        pickup_time: parameters.pickup_time || '12 minutes',
        pickup_location: 'Counter pickup',
      },
      providerName: cafeName,
      totalAmount: total,
      currency: 'USD',
    });
  }

  private async executeEmailOrder(
    context: ActionExecutionContext,
    parameters: any,
    total: number,
    cafeName: string,
    email: string
  ): Promise<ExecutionResult> {
    this.logger.log(`Executing email order to ${email}`);

    const orderNumber = `EM-${Date.now().toString().slice(-6)}`;

    // Create structured email content
    const emailContent = this.generateOrderEmail(
      context,
      parameters,
      total,
      cafeName,
      orderNumber
    );

    // This would send actual email in a real implementation
    this.logger.log(`Would send email to ${email}:`, emailContent);

    // Simulate email send delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return this.createSuccessResult({
      externalReference: `email_${orderNumber}`,
      externalData: {
        email_sent_to: email,
        email_subject: emailContent.subject,
        sent_at: new Date().toISOString(),
      },
      receiptData: {
        provider: cafeName,
        order_number: orderNumber,
        items: parameters.items,
        total: this.formatCurrency(total),
        status: 'Email sent to café',
        confirmation_method: 'Email confirmation expected within 30 minutes',
      },
      providerName: cafeName,
      totalAmount: total,
      currency: 'USD',
    });
  }

  private async executeSMSOrder(
    context: ActionExecutionContext,
    parameters: any,
    total: number,
    cafeName: string,
    phone: string
  ): Promise<ExecutionResult> {
    this.logger.log(`Executing SMS order to ${phone}`);

    const orderNumber = `SMS-${Date.now().toString().slice(-6)}`;

    // Create structured SMS content
    const smsContent = this.generateOrderSMS(parameters, total, orderNumber);

    // This would send actual SMS in a real implementation
    this.logger.log(`Would send SMS to ${phone}: ${smsContent}`);

    return this.createSuccessResult({
      externalReference: `sms_${orderNumber}`,
      externalData: {
        sms_sent_to: phone,
        sms_content: smsContent,
        sent_at: new Date().toISOString(),
      },
      receiptData: {
        provider: cafeName,
        order_number: orderNumber,
        items: parameters.items,
        total: this.formatCurrency(total),
        status: 'SMS sent to café',
        confirmation_method: 'SMS confirmation expected within 20 minutes',
      },
      providerName: cafeName,
      totalAmount: total,
      currency: 'USD',
    });
  }

  private async executeManualOrder(
    context: ActionExecutionContext,
    parameters: any,
    total: number,
    cafeName: string
  ): Promise<ExecutionResult> {
    this.logger.log('Executing manual order - creating task for operator');

    const orderNumber = `MAN-${Date.now().toString().slice(-6)}`;

    return this.createPendingResult({
      externalReference: `manual_${orderNumber}`,
      externalData: {
        task_type: 'manual_order',
        instructions: `Place order with ${cafeName}`,
        order_details: parameters,
        total_amount: total,
      },
      receiptData: {
        provider: cafeName,
        order_number: orderNumber,
        items: parameters.items,
        total: this.formatCurrency(total),
        status: 'Order queued for manual processing',
        confirmation_method: 'Manual confirmation within 1 hour',
      },
      providerName: cafeName,
      totalAmount: total,
      currency: 'USD',
    });
  }

  private generateOrderEmail(
    context: ActionExecutionContext,
    parameters: any,
    total: number,
    cafeName: string,
    orderNumber: string
  ) {
    const itemsList = parameters.items
      .map((item: any) => `${item.quantity}x ${item.name} - ${this.formatCurrency(item.price * item.quantity)}`)
      .join('\n');

    return {
      subject: `New Order #${orderNumber} from Rouh Spaces`,
      body: `
New order received via Rouh Spaces:

Order #: ${orderNumber}
Customer: ${parameters.customer_name || 'Rouh User'}
Phone: ${parameters.customer_phone || 'Not provided'}

Items:
${itemsList}

Total: ${this.formatCurrency(total)}

Pickup Time: ${parameters.pickup_time || 'ASAP (within 15 minutes)'}

Special Instructions: ${parameters.special_instructions || 'None'}

Please confirm this order by replying to this email or calling the customer.

---
This order was placed through Rouh Spaces
Action ID: ${context.action.id}
      `.trim(),
    };
  }

  private generateOrderSMS(parameters: any, total: number, orderNumber: string): string {
    const itemsCount = parameters.items.reduce((count: number, item: any) => count + item.quantity, 0);
    return `New Rouh order #${orderNumber}: ${itemsCount} items, total ${this.formatCurrency(total)}. Pickup: ${parameters.pickup_time || '15 min'}. Confirm?`;
  }
}