import got from 'got'
import { ensurePlayableSession } from '../../src/main/services/auth/elybyDeviceCode'

jest.mock('got', () => {
  const mockGot: any = {
    get: jest.fn(),
    post: jest.fn()
  }
  mockGot.post = jest.fn()
  return {
    __esModule: true,
    default: mockGot
  }
})

const mockedGot = got as unknown as {
  get: jest.Mock
  post: jest.Mock
}

describe('ensurePlayableSession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('keeps a valid OAuth access token', async () => {
    mockedGot.get.mockReturnValue({
      json: async () => ({
        id: 42,
        uuid: '0123456789abcdef0123456789abcdef',
        username: 'Steve'
      })
    })

    const next = await ensurePlayableSession(
      {
        type: 'elyby',
        accessToken: 'live-token',
        username: 'Steve',
        uuid: '01234567-89ab-cdef-0123-456789abcdef',
        displayName: 'Steve',
        refreshToken: 'refresh-token'
      },
      'client'
    )

    expect(next.accessToken).toBe('live-token')
    expect(next.refreshToken).toBe('refresh-token')
    expect(mockedGot.post).not.toHaveBeenCalled()
  })

  it('refreshes an expired OAuth token with the stored refresh_token', async () => {
    mockedGot.get.mockReturnValueOnce({ json: async () => ({}) }).mockReturnValueOnce({
      json: async () => ({
        id: 42,
        uuid: '0123456789abcdef0123456789abcdef',
        username: 'Steve'
      })
    })
    mockedGot.post.mockResolvedValue({
      statusCode: 200,
      body: {
        access_token: 'new-access',
        token_type: 'Bearer'
      }
    })

    const next = await ensurePlayableSession(
      {
        type: 'elyby',
        accessToken: 'expired',
        username: 'Steve',
        uuid: '01234567-89ab-cdef-0123-456789abcdef',
        displayName: 'Steve',
        refreshToken: 'refresh-token'
      },
      'client'
    )

    expect(next.accessToken).toBe('new-access')
    expect(next.refreshToken).toBe('refresh-token')
    expect(mockedGot.post).toHaveBeenCalled()
  })
})
