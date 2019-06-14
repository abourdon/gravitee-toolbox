const util = require('util')
const yargs = require('yargs')
const ElasticSearch = require('./elasticsearch')
const Rx = require('rxjs')

/**
 * Base type for any ElasticSearch script.
 *
 * Any inherited Script type will need to override the #definition(ElasticSearch) method to specify the Script execution
 *
 * @author Alexandre Carbenay
 */
class ElasticSearchScript {

    /**
     * Create a new ElasticSearch script by specifying its name and specific options
     *
     * @param {string} name the ElasticSearch script name
     * @param {object} specificOptions specific options of this ElasticSearch script
     */
    constructor(name = 'unnamed-script', specificOptions = {}) {
        this.name = name;
        this.specificOptions = specificOptions;
    }

    /**
     * Returns default options for any Script
     */
    static defaultOptions() {
        return Object.assign({}, {
            'url': {
                alias: 'elasticsearch-url',
                describe: 'Elasticsearch base URL',
                type: 'string',
                demandOption: true
            },
            'url-header': {
                alias: 'elasticsearch-url-header',
                describe: 'Additional HTTP header',
                type: 'array'
            },
            's': {
                alias: 'silent',
                describe: "Only errors will be displayed, but no information message",
                type: 'boolean'
            }
        });
    }

    /**
     * Get (full, i.e., specific + default) options of this ManagementApi script
     */
    get options() {
        return Object.assign(ElasticSearchScript.defaultOptions(), this.specificOptions);
    }

    /**
     * Display a message as it without any log level
     *
     * @param {string} message the message to display as it without any log level
     */
    displayRaw(message) {
        console.log(message);
    }

    /**
     * Display an information message
     *
     * @param {string} message the information message to display
     */
    displayInfo(message) {
        if (!this.argv.silent) {
            console.log(util.format('%s: %s', this.name, message));
        }
    }

    /**
     * Display an error message
     *
     * @param {string} message the error message to display
     */
    displayError(message) {
        console.error(util.format('%s: Error: %s', this.name, message));
    }

    /**
     * Display an error message and exit process with error
     *
     * @param {string} message the error message to display
     */
    handleError(error) {
        this.displayError(util.inspect(error));
        process.exit(1);
    }

    /**
     * Create a common Rx.Subscriber that will handle error and complete part
     *
     * @param {function(x: ?T)} next the function that will be called at any next event
     * @param {function(x: ?T)} error the function that will be called on error
     */
    defaultSubscriber(next = () => {}, error = this.displayError.bind(this)) {
        return Rx.Subscriber.create(
            next,
            error,
            _complete => {
                this.displayInfo('Done.')
            }
        );
    }

    /**
     * Initialize this ElasticSearch script command line arguments handler
     */
    _initArgv() {
        // Initialize yargs
        this.argv = yargs
            .usage('Usage: $0 [options]')
            .help('h')
            .alias('h', 'help')
            .version(false)
            .wrap(null)
            // Add this ElasticSearch script options
        Object.keys(this.options).forEach(optionKey => {
            this.argv = this.argv.option(optionKey, this.options[optionKey])
        });
        // Process to the check
        this.argv = this.argv.argv;
    }

    /**
     * Run this ElasticSearch Script instance by actually running the script definition specified by #definition(ElasticSearch)
     */
    run() {
        this._initArgv();
        const elasticsearch = ElasticSearch.createInstance(new ElasticSearch.Settings(this.argv['elasticsearch-url'], this.argv['elasticsearch-url-header']));
        this.displayInfo("Starting...")
        this.definition(elasticsearch);
    }

    /**
     * Definition of this ElasticSearch Script instance
     *
     * @param {object} _elasticsearch the ElasticSearch instance associated to this ElasticSearch Script instance
     */
    definition(_elasticsearch) {
        throw new Error('No definition found for this script. ElasticSearchScript#definition() needs to be overridden');
    }

}

module.exports = ElasticSearchScript;