import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';

import logger from '~/logger';

export interface HttpClientConfig {
  headers?: Record<string, string>;
  timeout?: number;
  params?: Record<string, string | number | boolean>;
}

interface AxiosErrorDetails {
  url?: string;
  method?: string;
  status?: number;
  statusText?: string;
  requestHeaders?: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
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
        const { status, statusText, headers, data } = error.response;
        errorDetails.status = status;
        errorDetails.statusText = statusText;
        errorDetails.responseHeaders = headers as Record<string, unknown>;
        errorDetails.responseData = data;
      }

      if (error.config?.headers) {
        errorDetails.requestHeaders = error.config.headers as Record<string, unknown>;
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
        this.httpService.get<T>(url, this.buildAxiosConfig(config)).pipe(catchError((error) => this.handleAxiosError(error)))
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  async post<T>(url: string, data: unknown, config?: HttpClientConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, this.buildAxiosConfig(config)).pipe(catchError((error) => this.handleAxiosError(error)))
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  async put<T>(url: string, data: unknown, config?: HttpClientConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, data, this.buildAxiosConfig(config)).pipe(catchError((error) => this.handleAxiosError(error)))
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  async patch<T>(url: string, data: unknown, config?: HttpClientConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.patch<T>(url, data, this.buildAxiosConfig(config)).pipe(catchError((error) => this.handleAxiosError(error)))
      );
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error);
    }
  }

  async delete<T>(url: string, config?: HttpClientConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(url, this.buildAxiosConfig(config)).pipe(catchError((error) => this.handleAxiosError(error)))
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
