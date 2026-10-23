import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsTemplate } from '../entities/sms-template.entity';

@Injectable()
export class SmsTemplateService {
  private readonly logger = new Logger(SmsTemplateService.name);

  constructor(
    @InjectRepository(SmsTemplate)
    private templateRepository: Repository<SmsTemplate>,
  ) {}

  async getTemplate(type: string): Promise<SmsTemplate | null> {
    const template = await this.templateRepository.findOne({
      where: { type, isActive: true },
    });

    if (!template) {
      this.logger.warn(`No active template found for type: ${type}`);
    }

    return template;
  }

  renderTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    let rendered = template;

    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), value);
    });

    return rendered;
  }

  getAvailableVariables(type: string): string[] {
    const variableMap: Record<string, string[]> = {
      payment: ['memberName', 'amount', 'expiryDate', 'serviceName'],
      general: ['memberName', 'message'],
    };

    return variableMap[type] || [];
  }

  async getAllTemplates(): Promise<SmsTemplate[]> {
    return this.templateRepository.find({
      where: { isActive: true },
      order: { type: 'ASC', name: 'ASC' },
    });
  }

  async getTemplateById(id: number): Promise<SmsTemplate | null> {
    return this.templateRepository.findOne({ where: { id } });
  }
}







