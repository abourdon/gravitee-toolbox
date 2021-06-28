const util = require('util');

/**
 * List of used font colors on console messages
 */
const FONT_COLOR = {
    RED: "\x1b[31m",
    YELLOW: "\x1b[33m",
    GREEN: "\x1b[32m",
    RESET: "\x1b[0m"
}

/**
 * Allowed log levels
 */
const LOG_LEVEL = {
    error: {
        level: 2,
        name: 'ERROR',
        color: FONT_COLOR.RED,
        out: console.error 
    },
    warn: {
        level: 1,
        name: 'WARNING',
        color: FONT_COLOR.YELLOW,
        out: console.warn
    },
    info: {
        level: 0,
        name: 'INFO',
        color: FONT_COLOR.GREEN,
        out: console.log
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
        level.out(util.format('%s%s %s [%s] %s%s', level.color, this.name, new Date(), level.name, message, FONT_COLOR.RESET));
    }

}

module.exports = {
    Console: Console,
    LOG_LEVEL: LOG_LEVEL
};