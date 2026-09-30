// utils/passwordHelpers/password-helper.js
import bcrypt from 'bcryptjs';
import logger from '../logger.js';

const PASSWORD_STRENGTH_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{8,}$/;

export const isStrongPassword = (password) => PASSWORD_STRENGTH_REGEX.test(password || '');

export const hashPassword = async (password) => {
  try {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    logger.error({ err: error }, 'Error hashing password');
    throw new Error('Failed to hash password');
  }
};

export const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    logger.error({ err: error }, 'Error comparing password');
    throw new Error('Failed to compare password');
  }
};
