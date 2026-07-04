export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  sid: string;
  av: number;
}
