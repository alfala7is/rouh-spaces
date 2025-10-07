import {
  Controller,
  Get,
  Param,
  Query,
  Redirect,
} from '@nestjs/common';

@Controller('r')
export class MagicLinkController {
  @Get(':runId')
  @Redirect()
  async redirectToCoordination(
    @Param('runId') runId: string,
    @Query('token') token: string,
    @Query('role') role: string,
  ) {
    const queryParams = [];
    if (token) {
      queryParams.push(`token=${encodeURIComponent(token)}`);
    }
    if (role) {
      queryParams.push(`role=${encodeURIComponent(role)}`);
    }

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    return {
      url: `/coordination/r/${runId}${queryString}`,
      statusCode: 302,
    };
  }
}