import { normalizeEmail } from '../../libs/utils/global.helper';

export const updateEmail = async (req, res, next) => {
    req.body.contact.email = await normalizeEmail(req.body.contact.email);
    next();
};
