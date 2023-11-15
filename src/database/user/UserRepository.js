import { UserModel } from './user.model';
import BaseRepository from '@tczdigital/node-utilities/database/mongodb/BaseRepository';

/* This class is a repository for the UserModel class. */
export default class UserRepository extends BaseRepository {
    constructor() {
        super(UserModel);
    }

    /**
     * "If the native parameter is true, return the native model, otherwise return a new instance of the
     * repository."
     *
     * @param [native=false] - If true, returns the native mongoose model. If false, returns a repository
     * instance.
     * @returns A new instance of the UserRepository class.
     */
    static get(native = false) {
        if (native) return UserModel;
        return new UserRepository();
    }
}
