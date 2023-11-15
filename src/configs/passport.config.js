import passportJWT from 'passport-jwt';

const { ExtractJwt } = passportJWT;

const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme('jwt'),
    secretOrKey: 'SECRET',
    passReqToCallback: true,
};

const passportConfiguration = () => {
    return opts;
};

export default passportConfiguration;
