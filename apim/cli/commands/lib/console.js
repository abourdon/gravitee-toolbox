const util = require('util');
const colors = require('colors/safe');

/**
 * Allowed log levels
 */
const LOG_LEVEL = {
    error: {
        level: 3,
        name: 'ERROR',
        color: colors.red,
        out: console.error 
    },
    warn: {
        level: 2,
        name: 'WARNING',
        color: colors.yellow,
        out: console.warn
    },
    info: {
        level: 1,
        name: 'INFO',
        color: colors.green,
        out: console.log
    },
    debug: {
        level: 0,
        name: 'DEBUG',
        color: colors.grey,
        out: console.debug
    }
};

/**
 * Utility class to display message on the console
 */
class Console {

    /**
     * Create a new Console instance attached with the give name
     * 
     * @param {string} name the name of the created Console
     * @param minimumLogLevel the minimum log level that this Console instance is allow to display
     */
    constructor(name, minimumLogLevel = LOG_LEVEL.info.level) {
        this.name = name;
        this.minimumLogLevel = minimumLogLevel;
    }

    /**
     * Display a message as it without any log level
     *
     * @param {string} message the message to display as it without any log level
     */
     raw(message) {
        console.log(message);
    }

    /**
     * Display a debug message
     *
     * @param {string} message the debug message to display
     */
     debug(message) {
        if (this.minimumLogLevel <= LOG_LEVEL.debug.level) {
            this._log(LOG_LEVEL.debug, message);
        }
    }

    /**
     * Display an information message
     *
     * @param {string} message the information message to display
     */
    info(message) {
        if (this.minimumLogLevel <= LOG_LEVEL.info.level) {
            this._log(LOG_LEVEL.info, message);
        }
    }

    /**
     * Display a warning message
     *
     * @param {string} message the warning message to display
     */
    warn(message) {
        if (this.minimumLogLevel <= LOG_LEVEL.warn.level) {
            this._log(LOG_LEVEL.warn, message);
        }
    }

    /**
     * Display an error message
     *
     * @param {string} message the error message to display
     */
    error(message) {
        this._log(LOG_LEVEL.error, message);
    }

    /**
     * Display a log message
     *
     * @param level the log level message
     * @param message the message to log
     * @private
     */
    _log(level, message) {
        level.out(level.color(util.format('%s %s [%s] %s', this.name, new Date(), level.name, message)));
    }

}

module.exports = {
    Console: Console,
    LOG_LEVEL: LOG_LEVEL
};