import { BadRequestException, Body, Controller, Post, UploadedFile } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { DocumentIngestionService } from '../../application/orchestrator.service';
import type { IngestTextDto } from '../dto/ingest-text.dto';
import { ingestTextSchema } from '../validators/ingest-text.schema';

@ApiTags('AI Chat')
@Controller('ingestion')
@ApiBearerAuth('access-token')
export class IngestionController {
  private readonly logger = new LoggerService();
  constructor(private readonly documentIngestion: DocumentIngestionService) {}

  @ApiOperation({ summary: 'Send message to AI chat' })
  @ApiBody({
    type: ChatRequestDto,
    description: 'Chat message request',
  })
  @ApiResponse({
    status: 201,
    description: 'AI response generated successfully',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request format',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid API key',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  @ApiResponse({
    status: 503,
    description: 'Chat service unavailable',
  })
  @Post('structured')
  ingestText(@Body() body: IngestTextDto) {
    // MVP next endpoints: POST /ingestion/pdf for uploaded PDFs and
    // POST /ingestion/structured for caller-defined JSON shapes.
    const parsed = ingestTextSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.documentIngestion.ingestText(parsed.data);
  }


  @ApiOperation({ summary: 'Send message to AI chat' })
  @ApiBody({
    type: ChatRequestDto,
    description: 'Chat message request',
  })
  @ApiResponse({
    status: 201,
    description: 'AI response generated successfully',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request format',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid API key',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  @ApiResponse({
    status: 503,
    description: 'Chat service unavailable',
  })
  @Post('pdf')
  @UseInterceptors(FileInterceptor('file'))
  ingestPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: IngestTextDto ) {
    this.logger.log({
      message: 'Received PDF ingestion request',
      fileName: file.originalname,
      fileSize: file.size,
      body,
    });
    const buffer: Buffer = file.buffer;
    const 
    const parsed = ingestTextSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.documentIngestion.ingestText(parsed.data);
  }
}
