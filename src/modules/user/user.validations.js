import Joi from 'joi';
import { mobileValidator } from '../../libs/utils/validations/global.validations';
import { callingCodedMaxLength, callingCodedMinLength, passwordMinLength } from '../../libs/constants';

export const createUser = Joi.object({
    body: {
        password: Joi.string().min(passwordMinLength),
        name: Joi.string().required().allow(''),
        contact: Joi.object({
            email: Joi.string().email().required(),
            callingCode: Joi.string().min(callingCodedMinLength).max(callingCodedMaxLength),
            mobile: Joi.required().custom(mobileValidator),
        }).required(),
    },
});
