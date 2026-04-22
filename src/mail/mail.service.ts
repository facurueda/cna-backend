import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const port = this.config.get<number>('SMTP_PORT') ?? 25;

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST') ?? 'localhost',
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
      tls: { rejectUnauthorized: false },
    });
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM') ?? 'noreply@app.com';

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Código para restablecer tu contraseña',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Restablecer contraseña</h2>
          <p>Ingresá el siguiente código en la aplicación para continuar:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center;
                      background: #f4f4f4; padding: 24px; border-radius: 8px; margin: 24px 0;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">
            Este código expira en 15 minutos. Si no solicitaste cambiar tu contraseña, ignorá este email.
          </p>
        </div>
      `,
    });

    this.logger.log(`Password reset code sent to ${to}`);
  }
}
