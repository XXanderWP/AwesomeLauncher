# Authentication (Ely.by)

## Scope

Only Ely.by authentication is supported. Microsoft and offline accounts are intentionally not implemented.

## API

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
  displayName: string
}
```

## Launch integration

Minecraft is started with JVM agent:

```
-javaagent:<resources>/libraries/authlib-injector/authlib-injector.jar=ely.by
```

Game args use Ely access token / uuid / displayName; `user_type` is `mojang`. `--xuid` / `--clientId` are stripped for non-Microsoft sessions.

Register URL: `https://account.ely.by/register`
