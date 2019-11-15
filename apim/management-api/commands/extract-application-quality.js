const CliCommand = require('./lib/cli-command');
const ElasticSearch = require('../../elasticsearch/lib/elasticsearch');
const {QualityCriterion, convertQualityCriteria} = require('./lib/quality-criteria-converter');
const StringUtils = require('./lib/string-utils');
const Rx = require('rxjs');
const {filter, flatMap, map, reduce, take, tap} = require('rxjs/operators');
const util = require('util');

const CSV_SEPARATOR = ',';
const DESCRIPTION_MIN_LENGTH = 30;
const LIST_APPLICATIONS_TIMEOUT = 30000;
const ONLY_ONE_ES_RESULT = 1;

/*
 * Application name is composed of:
 * - eventually a namespace (potentially multiple words)
 * - a resource or provider (potentially multiple words)
 * - eventually a country
 * Example: Multiple words namespace - Resource or provider - Country
 */
const APP_NAME_REGEX = /^(\w+( \w+)* \- )?\w+( \w+)*( \- \w+)?$/;

/**
 * Extract quality criteria compliance corresponding to an Application as a CSV content.
 *
 * @author Aurelien Bourdon
 */
class ExtractApplicationQuality extends CliCommand {

    constructor() {
        super(
            'extract-application-quality',
            {
                'filter-by-id': {
                    describe: 'Filter by Application UUID',
                    type: 'string'
                },
                'filter-by-name': {
                    describe: 'Filter by Application name (insensitive regex)',
                    type: 'string'
                },
                'delay-period': {
                    describe: 'Delay period to temporize Application broadcast',
                    type: 'number',
                    default: 200
                },
                'evaluate-runtime': {
                    describe: 'Indicates whether the runtime criteria must be evaluated',
                    type: 'boolean',
                    default: false
                },
                'runtime-duration': {
                    describe: 'Runtime time range duration',
                    type: 'string',
                    choices: ['1w', '1M'], // Choices are limited by Gravitee health availability results
                    default: '1M'
                },
                'elasticsearch-url': {
                    describe: 'Elasticsearch base URL',
                    type: 'string'
                },
                'elasticsearch-url-header': {
                    describe: 'Additional HTTP header',
                    type: 'array'
                },
                'elasticsearch-index': {
                    describe: 'Elasticsearch request index',
                    type: 'string',
                    default: 'gravitee-request-*'
                }
            }
        );
    }

    definition(managementApi) {
        // ElasticSearch connection
        const elasticsearch = this.argv['elasticsearch-url'] ?
            ElasticSearch.createInstance(new ElasticSearch.Settings(this.argv['elasticsearch-url'], this.argv['elasticsearch-url-header'])) :
            undefined;

        // Process to the application quality extract
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // Get Application(s)
                flatMap(_token => this.argv['filter-by-id'] ?
                    managementApi.getApplication(this.argv['filter-by-id']) :
                    managementApi.listApplications(
                        {
                            byName: this.argv['filter-by-name']
                        },
                        this.argv['delay-period'],
                        LIST_APPLICATIONS_TIMEOUT)
                ),

                // Start Application quality evaluation
                tap(app => this.displayInfo(util.format('Get quality metrics for Application "%s" (%s)', app.name, app.id))),
                flatMap(app => this.evaluateCriteria(app, managementApi, elasticsearch)),
                reduce((acc, criteria) => acc.concat(criteria), [])
            )
            .subscribe(this.defaultSubscriber(
                appsQuality => {
                    this.displayInfo('CSV content:');
                    this.displayRaw('Application id,Application name,' + this.getEnabledCriteria().map(criteria => criteria.reference).join(CSV_SEPARATOR));
                    appsQuality.forEach((appQuality) =>
                        this.displayRaw(
                            appQuality.app.id + CSV_SEPARATOR +
                            appQuality.app.name + CSV_SEPARATOR +
                            appQuality.quality.map(criteria => criteria.complied).join(CSV_SEPARATOR)
                        )
                    );
                }
            ));
    }

    getCriteria() {
        if (this._criteria) {
            return this._criteria;
        }
        this._criteria = {
            nameNamingConvention: {
                reference: 'APP-DF01',
                description: "Name's naming convention complied",
                atRuntime: false,
                enabled: true,
                evaluate: app => this.evaluateNamingConvention(APP_NAME_REGEX, app.name),
            },
            descriptionMinLength: {
                reference: 'APP-DF02',
                description: "Description's length higher than " + DESCRIPTION_MIN_LENGTH,
                atRuntime: false,
                enabled: true,
                evaluate: app => this.evaluateMinimumLength(DESCRIPTION_MIN_LENGTH, app.description.length)
            },
            appUsage: {
                reference: 'APP-R00',
                description: 'Application usage at runtime',
                atRuntime: true,
                enabled: true,
                evaluate: (app, managementApi, elasticsearch) => this.evaluateUsage(app, managementApi, elasticsearch)
            }
        };
        return this._criteria;
    }

    getEnabledCriteria() {
        if (this._enabledCriteria) {
            return this._enabledCriteria;
        }
        this._enabledCriteria = Object
            .values(this.getCriteria())
            .filter(criteria => criteria.enabled && (!criteria.atRuntime || criteria.atRuntime === this.runtimeEvaluationEnabled()))
            // Sort by reference alphabetical order to order both CSV header and lines
            .sort((left, right) => StringUtils.compare(left.reference, right.reference));
        return this._enabledCriteria;
    }

    evaluateCriteria(app, managementApi, elasticsearch, appId) {
        return Rx
            .of(app)
            .pipe(
                flatMap(app => Rx
                    .from(this.getEnabledCriteria())
                    .pipe(
                        flatMap(criteria => criteria
                            .evaluate(app, managementApi, elasticsearch)
                            .pipe(
                                map(complied => new QualityCriterion(criteria.description, criteria.reference, complied))
                            )),
                        reduce((acc, criterion) => acc.concat(criterion), []),
                        map(quality => {
                            return {
                                app: app,
                                // Sort by reference alphabetical order to be compliant with CSV header
                                quality: quality.sort((left, right) => StringUtils.compare(left.reference, right.reference))
                            };
                        })
                    )
                )
            );
    }

    evaluateNamingConvention(expectedRegex, actual) {
        return Rx.of(StringUtils.matches(actual, expectedRegex))
    }

    evaluateMinimumLength(expected, actual) {
        return Rx.of(expected <= actual);
    }

    evaluateUsage(app, managementApi, elasticsearch) {
        return elasticsearch.searchHits(
            this.argv['elasticsearch-index'],
            util.format('now-%s', this.argv['runtime-duration']),
            'now',
            [['application', app.id]],
            ONLY_ONE_ES_RESULT
        ).pipe(
            take(ONLY_ONE_ES_RESULT),
            map(hit => hit.meta.total > 0)
        );
    }

    runtimeEvaluationEnabled() {
        return this.argv['evaluate-runtime'];
    }

}

new ExtractApplicationQuality().run();