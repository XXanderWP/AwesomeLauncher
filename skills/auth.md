# Authentication (Ely.by)

## Scope

Only Ely.by authentication is supported. Microsoft and offline accounts are intentionally not implemented.

## Preferred flow: OAuth device code

Endpoints:

- `POST https://account.ely.by/api/oauth2/v1/devicecode`
- `POST https://account.ely.by/api/oauth2/v1/token` (`grant_type=urn:ietf:params:oauth:grant-type:device_code`)
- Account info: `GET https://account.ely.by/api/account/v1/info` with `Authorization: Bearer …`

Default public `client_id`: `ely` (constant `ELYBY_OAUTH_CLIENT_ID`).
Scopes: `account_info offline_access minecraft_server_session`.

The OAuth access token is used directly as the Minecraft session token (same pattern as ElyPrismLauncher).

UI: device code is the primary login tab; username/password remains available as fallback.

## Legacy password API

Base URL: `https://authserver.ely.by`

- `POST /auth/authenticate` `{ username, password, clientToken, requestUser: true }`
- `POST /auth/refresh`
- `POST /auth/validate`
- `POST /auth/invalidate`

2FA: append TOTP as `password:CODE`.

## Stored account shape

```ts
{
  type: 'elyby',
  accessToken: string,
  username: string,
  uuid: string, // dashed
  displayName: string,
  elyId?: number // site id for https://ely.by/u{id}
}
```

Profile button opens `https://ely.by/u{elyId}` when known; otherwise `https://account.ely.by/`.
On startup, OAuth sessions without `elyId` are enriched via account-info API.

## Launch integration

Minecraft is started with JVM agent:

```
-javaagent:<resources>/libraries/authlib-injector/authlib-injector.jar=ely.by
```

Game args use Ely access token / uuid / displayName; `user_type` is `mojang`. `--xuid` / `--clientId` are stripped for non-Microsoft sessions.

Register URL: `https://account.ely.by/register`
