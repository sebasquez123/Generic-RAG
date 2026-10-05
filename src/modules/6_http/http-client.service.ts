import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

import { LoggerService } from '~/shared/logging/main.logger';

const logger = new LoggerService('HttpClientService');

export interface HttpClientConfig {
  headers?: Record<string, string>;
  timeout?: number;
  params?: Record<string, string | number | boolean>;
}

// Headers and query parameters are never logged: they carry provider API keys.
interface AxiosErrorDetails {
  url?: string;
  method?: string;
  status?: number;
  statusText?: string;
  responseData?: unknown;
  message: string;
}

@Injectable()
export class HttpClientService {
  constructor(protected readonly httpService: HttpService) {}

  protected handleAxiosError(error: unknown): never {
    if (this.isAxiosError(error)) {
      const errorDetails: Partial<AxiosErrorDetails> = {
        message: error.message,
      };

      if (error.config?.url) {
        errorDetails.url = error.config.url;
      }

      if (error.config?.method) {
        errorDetails.method = error.config.method.toUpperCase();
      }

      if (error.response) {
        const { status, statusText, data } = error.response;
        errorDetails.status = status;
        errorDetails.statusText = statusText;
        errorDetails.responseData = data;
      }

      logger.error(errorDetails, 'HTTP request failed');
    } else {
      logger.error({ error }, 'Unexpected error during HTTP request');
    }

    throw error;
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return (error as AxiosError).isAxiosError === true;
  }

  async get<T>(url: string, config?: HttpClientConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, this.buildAxiosConfig(config)),
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  async post<T>(
    url: string,
    data: unknown,
    config?: HttpClientConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, this.buildAxiosConfig(config)),
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  async put<T>(
    url: string,
    data: unknown,
    config?: HttpClientConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, data, this.buildAxiosConfig(config)),
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  async patch<T>(
    url: string,
    data: unknown,
    config?: HttpClientConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.patch<T>(url, data, this.buildAxiosConfig(config)),
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  async delete<T>(url: string, config?: HttpClientConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(url, this.buildAxiosConfig(config)),
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  private buildAxiosConfig(config?: HttpClientConfig): AxiosRequestConfig {
    if (!config) {
      return {};
    }

    const axiosConfig: AxiosRequestConfig = {};

    if (config.headers) {
      axiosConfig.headers = config.headers;
    }

    if (config.timeout) {
      axiosConfig.timeout = config.timeout;
    }

    if (config.params) {
      axiosConfig.params = config.params;
    }

    return axiosConfig;
  }
}
