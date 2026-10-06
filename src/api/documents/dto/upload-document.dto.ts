import { IsEnum, IsOptional, IsString } from "class-validator";
import { DocumentCategory } from "@prisma/client";

export class UploadDocumentDto {
  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  @IsOptional()
  @IsString()
  linkedEntityType?: string;

  @IsOptional()
  @IsString()
  linkedEntityId?: string;
}
