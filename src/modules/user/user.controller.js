import UserRepository from '../../database/user/UserRepository';
import httpStatus from 'http-status';

/**
 * It registers a user
 * @param req - The request object.
 * @param res - The response object.
 */
export const registerUser = async (req, res) => {
    const {
        body,
        body: {
            contact: { email, mobile },
        },
    } = req;

    const foundUser = await UserRepository.get().findOne({ $or: [{ 'contact.email': email }, { 'contact.mobile': mobile }] }, { _id: 1 });

    if (foundUser) return res.create(httpStatus.CONFLICT, 'User Already Exists');

    const createdUser = await UserRepository.get().create(body);

    return res.create(httpStatus.OK, 'User Registered', createdUser);
};
