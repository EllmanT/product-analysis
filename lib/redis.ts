import { Redis } from '@upstash/redis'

export const connection = new Redis({
  url: 'https://renewed-molly-27980.upstash.io',
  token: 'AW1MAAIjcDEzM2EwOTM5ODZhMDk0OGQ3YTA0MGVkOTNjMWEwY2FlNnAxMA',
})