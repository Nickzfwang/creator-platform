import { Module, Global } from '@nestjs/common';
import { BrevoService } from './brevo.service';

@Global()
@Module({
  providers: [BrevoService],
  exports: [BrevoService],
})
export class BrevoModule {}
