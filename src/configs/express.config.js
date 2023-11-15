import compress from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import passport from 'passport';
import path from 'path';
import useragent from 'express-useragent';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import http from 'http';

import { httpLogger } from '@tczdigital/node-utilities/logger/logger.middleware';
import utilitiesMiddleware from '@tczdigital/node-utilities';
import { requestContextMiddleware } from '@tczdigital/node-utilities/middleware/context.middleware';
import errorHandlerMiddleware from '@tczdigital/node-utilities/middleware/errorHandler.middleware';
import configManager from '@tczdigital/node-utilities/configManager';

import { apiNotFoundError, sendErrorResponse } from '../libs/middlewares/errors.middleware';
import { mongoConnectionCheck } from '../libs/middlewares/mongodb.middleware';

import routes from '../routes';

import passConfig from './passport.config';
import { defaultConfig } from './constants.config';
import './mongodb.config';

/* This is creating an express app. */
const app = express();

const server = http.createServer(app);

app.use(utilitiesMiddleware(defaultConfig));

/* This is a middleware that will detect the brandApp agent of the client and add it to the request object. */
app.use(useragent.express());

/* This is serving the upload folder. */
app.use(express.static('public'));

/* This is serving the `node` folder in the `upload` folder. */
app.use('/node', express.static(path.resolve(__dirname, '../../node/')));

/* This is telling express to parse the body of the request as JSON. */
app.use(express.json());

/* This is limiting the size of the request body to 500kb. */
app.use(express.urlencoded({ extended: true, limit: '500kb' }));

/* Parsing cookies from the request. */
app.use(cookieParser());

/* This is a middleware that compresses the response. */
app.use(compress());

/* This is telling express to use the passport middleware. */
passConfig(passport);

/* This is telling express to use the passport middleware. */
app.use(passport.initialize());

/* This is a middleware that will add security headers to the response. */
app.use(helmet());

/* This is a middleware that will allow the client to make cross-origin requests. */
app.use(cors());

/* This is a middleware that will sanitize the request body from potentially malicious code. */
app.use(mongoSanitize());

/* This is a middleware that will sanitize the request body from potentially malicious code. */
app.use(xss());

/* This is a middleware that will prevent the server from being possible to be DoSed by a malicious brandApp. */
app.use(hpp());

/* This is a middleware that will add the requestId to the request object. */
app.use(requestContextMiddleware);

app.use(httpLogger);

/* This is a middleware that will check if the mongoDB connection is alive. */
app.use(mongoConnectionCheck);

/* This is telling express to use the routes in the `routes.js` file. */
app.use(`${configManager.get('API_PREFIX')}/${configManager.get('SERVICE_NAME')}`, routes);

/* This is a catch-all route that will catch all the routes that are not defined in the `routes.js`
file. */
app.all('*', apiNotFoundError);

/* This is a middleware that will catch all the errors that are thrown in the brandApp and return a response with the error message. */
app.use((err, req, res, next) => errorHandlerMiddleware(sendErrorResponse)(err, req, res, next));

export default server;
