import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UploadsService } from './uploads.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('UploadsService', () => {
  let service: UploadsService;
  const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<
    typeof getSignedUrl
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSignedUrl.mockResolvedValue('https://signed-url.example.com');

    const configValues: Record<string, string> = {
      R2_ACCOUNT_ID: 'account-id',
      R2_ACCESS_KEY_ID: 'access-key-id',
      R2_SECRET_ACCESS_KEY: 'secret-access-key',
      R2_BUCKET_VIDEOS: 'vyro-clips',
      R2_BUCKET_THUMBNAILS: 'vyro-thumbnails',
      PUBLIC_BASE_URL: 'https://videos.example.com',
      R2_THUMBNAILS_PUBLIC_BASE_URL: 'https://thumbs.example.com',
      R2_PRESIGN_EXPIRES_IN: '3600',
    };

    const config = {
      get: jest.fn((key: string) => configValues[key]),
    };

    service = new UploadsService(config as unknown as ConfigService);
  });

  it('uses thumbnails bucket and public URL for image presign', async () => {
    const result = await service.presign({
      competitionId: 'comp-1',
      matchId: 'match-1',
      fileName: 'thumb.webp',
      contentType: 'image/webp',
      assetType: 'image',
      size: 1234,
    });

    const putCommand = mockedGetSignedUrl.mock.calls[0][1] as PutObjectCommand;

    expect(putCommand).toBeInstanceOf(PutObjectCommand);
    expect(putCommand.input.Bucket).toBe('vyro-thumbnails');
    expect(result.key).toContain('/thumbnails/');
    expect(result.assetType).toBe('image');
    expect(result.readUrl).toBe(`https://thumbs.example.com/${result.key}`);
  });

  it('uses videos bucket for video presign', async () => {
    const result = await service.presign({
      competitionId: 'comp-1',
      matchId: 'match-1',
      fileName: 'clip.mp4',
      contentType: 'video/mp4',
      assetType: 'video',
      size: 9999,
    });

    const putCommand = mockedGetSignedUrl.mock.calls[0][1] as PutObjectCommand;

    expect(putCommand.input.Bucket).toBe('vyro-clips');
    expect(result.assetType).toBe('video');
    expect(result.readUrl).toBe(`https://videos.example.com/${result.key}`);
  });

  it('defaults assetType to video when omitted', async () => {
    const result = await service.presign({
      competitionId: 'comp-1',
      matchId: 'match-1',
      fileName: 'clip.mp4',
      contentType: 'video/mp4',
      size: 9999,
    });

    const putCommand = mockedGetSignedUrl.mock.calls[0][1] as PutObjectCommand;

    expect(putCommand.input.Bucket).toBe('vyro-clips');
    expect(result.assetType).toBe('video');
  });

  it('validates contentType for image assetType', async () => {
    await expect(
      service.presign({
        competitionId: 'comp-1',
        matchId: 'match-1',
        fileName: 'wrong.mp4',
        contentType: 'video/mp4',
        assetType: 'image',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates contentType for video assetType', async () => {
    await expect(
      service.presign({
        competitionId: 'comp-1',
        matchId: 'match-1',
        fileName: 'wrong.webp',
        contentType: 'image/webp',
        assetType: 'video',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns direct public URL for thumbnail keys on read', async () => {
    const key = 'comp-1/match-1/thumbnails/thumb.webp';
    const result = await service.presignRead({ key });

    expect(result).toEqual({
      key,
      readUrl: `https://thumbs.example.com/${key}`,
      expiresIn: 3600,
    });
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('keeps signed read URLs for video keys', async () => {
    const key = 'comp-1/match-1/clip.mp4';
    const result = await service.presignRead({ key });

    const getCommand = mockedGetSignedUrl.mock.calls[0][1] as GetObjectCommand;

    expect(getCommand).toBeInstanceOf(GetObjectCommand);
    expect(getCommand.input.Bucket).toBe('vyro-clips');
    expect(result).toEqual({
      key,
      readUrl: 'https://signed-url.example.com',
      expiresIn: 3600,
    });
  });
});
