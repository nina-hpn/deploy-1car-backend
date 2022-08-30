import { User } from '../api/user/models/user.entity';
import { ExecutionContext } from '@nestjs/common';

export const checkUserHaveEnoughInfo = (user: User) => {
  return !!(user && user.dateOfBirth && user.phoneNumber && user.name);
};

export const getAuthorizationFromCtx = (ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().headers.authorization;
};

export const getTokenFromAuthorizationString = (
  authorizationString: string,
): string | null => {
  if (authorizationString && authorizationString.startsWith('Bearer')) {
    return authorizationString.substring(7, authorizationString.length);
  } else return null;
};