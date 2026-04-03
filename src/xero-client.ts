import { XeroClient } from 'xero-node';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(__dirname, '..', 'tokens.json');

export interface XeroTokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  tenant_id?: string;
}

export class XeroService {
  private client: XeroClient;
  private tokenSet: XeroTokenSet | null = null;

  constructor(clientId: string, clientSecret: string, redirectUri: string, scopes: string[]) {
    this.client = new XeroClient({
      clientId,
      clientSecret,
      redirectUris: [redirectUri],
      scopes,
    });

    // Try to load existing tokens
    this.loadTokens();
  }

  private loadTokens(): void {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        const data = fs.readFileSync(TOKEN_PATH, 'utf-8');
        this.tokenSet = JSON.parse(data);
        console.log('✓ Loaded existing tokens');
      }
    } catch (error) {
      console.log('No existing tokens found');
    }
  }

  private saveTokens(): void {
    if (this.tokenSet) {
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(this.tokenSet, null, 2));
      console.log('✓ Tokens saved');
    }
  }

  private lastState: string = '';

  public async getConsentUrl(): Promise<string> {
    const url = await this.client.buildConsentUrl();
    // Extract and cache the state param so manual auth can reconstruct the callback URL
    try {
      const parsed = new URL(url);
      this.lastState = parsed.searchParams.get('state') || '';
    } catch {}
    return url;
  }

  public getLastState(): string {
    return this.lastState;
  }

  public async listTenants(): Promise<{ tenantId: string; tenantName: string }[]> {
    await this.client.updateTenants();
    return (this.client.tenants || []).map(t => ({
      tenantId: t.tenantId,
      tenantName: t.tenantName,
    }));
  }

  public setTenantId(tenantId: string): void {
    if (this.tokenSet) {
      this.tokenSet.tenant_id = tenantId;
      this.saveTokens();
    }
  }

  public async handleCallback(url: string): Promise<void> {
    const tokenSet = await this.client.apiCallback(url);

    this.tokenSet = {
      access_token: tokenSet.access_token!,
      refresh_token: tokenSet.refresh_token!,
      expires_at: tokenSet.expires_at!,
    };

    // Get tenant (organization) info
    await this.client.updateTenants();
    const tenants = this.client.tenants;

    if (tenants && tenants.length > 0) {
      this.tokenSet.tenant_id = tenants[0].tenantId;
      console.log(`✓ Connected to organization: ${tenants[0].tenantName}`);
    }

    this.saveTokens();
  }

  public async ensureValidToken(): Promise<void> {
    if (!this.tokenSet) {
      throw new Error('No token set available. Please authenticate first using: npm run auth');
    }

    // Set the token on the client first
    this.client.setTokenSet({
      access_token: this.tokenSet.access_token,
      refresh_token: this.tokenSet.refresh_token,
      expires_at: this.tokenSet.expires_at,
    });

    // Check if token is expired or about to expire (within 5 minutes)
    const now = Date.now();
    const expiresAt = this.tokenSet.expires_at * 1000; // Convert to milliseconds
    const fiveMinutes = 5 * 60 * 1000;

    if (now >= expiresAt - fiveMinutes) {
      console.log('Token expired, refreshing...');
      await this.refreshToken();
    }
  }

  private async refreshToken(): Promise<void> {
    if (!this.tokenSet?.refresh_token) {
      throw new Error('No refresh token available');
    }

    const tokenSet = await this.client.refreshToken();

    this.tokenSet = {
      access_token: tokenSet.access_token!,
      refresh_token: tokenSet.refresh_token!,
      expires_at: tokenSet.expires_at!,
      tenant_id: this.tokenSet.tenant_id,
    };

    this.saveTokens();
    console.log('✓ Token refreshed');
  }

  public getTenantId(): string {
    if (!this.tokenSet?.tenant_id) {
      throw new Error('No tenant ID available. Please authenticate first.');
    }
    return this.tokenSet.tenant_id;
  }

  public getClient(): XeroClient {
    return this.client;
  }

  public isAuthenticated(): boolean {
    return this.tokenSet !== null;
  }
}
