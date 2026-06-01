
export enum Role {
  scrapper = 'scrapper',
  analyst = 'analyst',
  marketer = 'marketer',
  publisher = 'publisher',
}

export interface BotEntity {
  id: string | number;
  name: string;
}

export interface BotContract {
  id: string | number;
  role: Role;
  permissions: string[];
  scopes: string[];
}

export interface TemporaryContext {
  botInfo?: BotEntity;
  contract?: BotContract;
  route?: string;

  traceId: string;
  startTime: [number, number];
  httpRequest: {
    remoteIp: string;
    referer: string | undefined;
    userAgent: string | undefined;
    domain?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
}