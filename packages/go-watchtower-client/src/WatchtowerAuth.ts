import { Core } from '@go-automation/go-common';

import type {
  CliLoginRequest,
  CliLoginResponse,
  HumanLoginRequest,
  HumanLoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  ServiceLoginRequest,
  ServiceLoginResponse,
} from './WatchtowerTypes.js';

export type WatchtowerPasswordLoaderFn = () => Promise<string>;

export type WatchtowerAuthCredentials =
  | { readonly kind: 'HUMAN'; readonly email: string; readonly password: string }
  | { readonly kind: 'CLI_PAT'; readonly token: string }
  | {
      readonly kind: 'SERVICE';
      readonly serviceId: string;
      readonly password: string;
      readonly reloadPassword?: WatchtowerPasswordLoaderFn;
    };

interface WatchtowerTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAtMs: number;
}

/** In-memory Watchtower token cache with bounded single-flight refresh. */
export class WatchtowerAuth {
  private tokens: WatchtowerTokens | undefined;
  private renewal: Promise<string> | undefined;

  constructor(
    private readonly http: Pick<Core.GOHttpClient, 'post'>,
    private readonly credentials: WatchtowerAuthCredentials,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.tokens !== undefined && this.tokens.expiresAtMs - Date.now() > 30_000) {
      return this.tokens.accessToken;
    }
    return await this.renewAccessToken();
  }

  async renewAccessToken(): Promise<string> {
    if (this.renewal !== undefined) return await this.renewal;
    this.renewal = this.performRenewal().finally(() => {
      this.renewal = undefined;
    });
    return await this.renewal;
  }

  private async performRenewal(): Promise<string> {
    if (this.tokens !== undefined) {
      try {
        const request: RefreshTokenRequest = { refreshToken: this.tokens.refreshToken };
        const response = await this.http.post<RefreshTokenResponse>('/auth/refresh', request);
        return this.storeTokens(response);
      } catch {
        return await this.login(true);
      }
    }
    return await this.login(false);
  }

  private async login(reloadPassword: boolean): Promise<string> {
    if (this.credentials.kind === 'CLI_PAT') {
      const request: CliLoginRequest = { token: this.credentials.token };
      const response = await this.http.post<CliLoginResponse>('/auth/cli-login', request);
      return this.storeTokens(response);
    }
    if (this.credentials.kind === 'SERVICE') {
      const password =
        reloadPassword && this.credentials.reloadPassword !== undefined
          ? await this.credentials.reloadPassword()
          : this.credentials.password;
      const request: ServiceLoginRequest = {
        serviceId: this.credentials.serviceId,
        password,
      };
      const response = await this.http.post<ServiceLoginResponse>('/auth/service/login', request);
      return this.storeTokens(response);
    }
    const request: HumanLoginRequest = { email: this.credentials.email, password: this.credentials.password };
    const response = await this.http.post<HumanLoginResponse>('/auth/login', request);
    return this.storeTokens(response);
  }

  private storeTokens(
    response: RefreshTokenResponse | ServiceLoginResponse | HumanLoginResponse | CliLoginResponse,
  ): string {
    this.tokens = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAtMs: Date.now() + response.expiresIn * 1_000,
    };
    return response.accessToken;
  }
}
