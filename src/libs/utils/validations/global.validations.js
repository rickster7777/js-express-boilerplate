import validator from 'validator';
import logger from '@tczdigital/node-utilities/logger';

/**
 * It validates the mobile number and returns the mobile number if it's valid, otherwise it returns an
 * error message
 * @param mobile - The value of the field being validated.
 * @param helpers - This is an object that contains the following methods:
 * @returns The mobile number is being returned.
 */
export const mobileValidator = (mobile, helpers) => {
    try {
        const isValid = validator.isMobilePhone(mobile);
        if (!isValid) return helpers.message('Invalid Mobile number');
        return mobile;
    } catch (error) {
        logger.error(`Error validating email | Error : ${error}`);
        return helpers.message('Invalid Mobile number');
    }
};
