const { CliCommand } = require('./lib/cli-command');
const ElasticSearch = require('./lib/elasticsearch');
const { QualityCriterion, convertQualityCriteria } = require('./lib/quality-criteria-converter');
const Rx = require('rxjs')
const { filter, flatMap, map, reduce, tap } = require('rxjs/operators');
const util = require('util')

const DESCRIPTION_MIN_LENGTH = 100;
const FUNCTIONAL_DOC_TYPE = "MARKDOWN";
const TECHNICAL_DOC_TYPE = "SWAGGER";

const API_TYPES_VIEW_NAMES = {
    'system-apis': 'System',
    'referential-apis': 'Referential',
    'experience-apis': 'Experience'
};
const DEFAULT_API_TYPE = 'System';
const DEFAULT_API_NAME_REGEX = /^.*$/;
const DEFAULT_API_VERSION_REGEX = /^\d+$/;
const DEFAULT_API_CONTEXT_PATH_REGEX = /^(\/.+)+$/;
/*
 * Data classification labels are composed of:
 * - a confidentiality label as C0, C1, C2 or C3
 * - an integrity label as I1, I2 or I3
 * - an availability label as A1, A2 or A3
 */
const CONFIDENTIALITY_LABEL_REGEX = /^C[0-3]$/;
const INTEGRITY_LABEL_REGEX = /^I[1-3]$/;
const AVAILABILITY_LABEL_REGEX = /^A[1-3]$/;
/**
 * APIs availability categories and associated runtime quality thresholds.
 */
const DEFAULT_AVAILABILITY = "A1";
const RUNTIME_THRESHOLDS = {
    A1: {
        responseTimeMedian: 500,
        responseTime95Percentile: 1000,
        errorsRatio: 0.10,
        healthCheckAvailability: 90
    },
    A2: {
        responseTimeMedian: 300,
        responseTime95Percentile: 600,
        errorsRatio: 0.05,
        healthCheckAvailability: 99
    },
    A3: {
        responseTimeMedian: 200,
        responseTime95Percentile: 500,
        errorsRatio: 0.02,
        healthCheckAvailability: 99.9
    }
}

const matchNamingConvention = function(valueSelector, regexExtractor, apiDetail, command) {
    return (apiDetail, command) => {
        const matches = valueSelector(apiDetail).match(regexExtractor(command));
        return matches != null && matches.length > 0;
    }
}

// Quality criteria definition. Criteria MUST be ordered by reference alphabetical order
const CRITERIA = {
    nameNamingConvention: {reference: "DF01", description: "Name's naming convention complied"},
    versionNamingConvention: {reference: "DF02", description: "Version's naming convention complied"},
    descriptionMinLength: {reference: "DF03", description: "Description's length higher than " + DESCRIPTION_MIN_LENGTH},
    labelsDefined: {reference: "DF05", description: "Labels defined"},
    dataClassificationLabels: {reference: "DF06", description: "Data classification labels complied"},
    logoDefined: {reference: "DF07", description: "Logo defined"},
    viewsDefined: {reference: "DF08", description: "Views defined"},
    functionalDocDefined: {reference: "DF11", description: "Functional documentation defined"},
    functionalDocHomePage: {reference: "DF13", description: "Functional documentation published as home page"},
    technicalDocDefined: {reference: "DF14", description: "Technical documentation defined"},
    supportEmailDefined: {reference: "DF17", description: "Support email address defined"},
    contextPathNamingConvention: {reference: "DF18", description: "Context-path's naming convention complied"},
    endpointsNamingConvention: {reference: "DF19", description: "Groups of endpoints and endpoints naming convention complied"},
    healthCheckActive: {reference: "DF20", description: "Health-check activated"},
    apiTypeViewDefined: {reference: "DF22", description: "API type view defined"},
    apiUsage: {reference: "R00", description: "API usage at runtime"},
    responseTimeMedian: {reference: "R01", description: "Median response time"},
    responseTime95Percentile: {reference: "R02", description: "95th percentile response time"},
    errorsRatio: {reference: "R03", description: "Errors ratio"},
    healthCheckAvailability: {reference: "R04", description: "API health-check availability"}
}

// Quality criteria evaluators, used to evaluate quality against the API detail
const apiDetailsCriteriaEvaluators = [
    {
        criterion: CRITERIA.nameNamingConvention,
        evaluate: matchNamingConvention(api => api.name, command => command.argv['name-regex'])
    },
    {
        criterion: CRITERIA.versionNamingConvention,
        evaluate: matchNamingConvention(api => api.version, command => command.argv['version-regex'])
    },
    {
        criterion: CRITERIA.descriptionMinLength,
        evaluate: api => api.description.length > DESCRIPTION_MIN_LENGTH,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: CRITERIA.labelsDefined,
        evaluate: api => api.labels !== undefined && api.labels.length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: CRITERIA.dataClassificationLabels,
        evaluate: api => [CONFIDENTIALITY_LABEL_REGEX, INTEGRITY_LABEL_REGEX, AVAILABILITY_LABEL_REGEX]
                                    .map(regex => matchNamingConvention(label => label, command => regex))
                                    .map(regexEvaluator => api.labels !== undefined &&
                                                           api.labels.filter(label => regexEvaluator(label)).length == 1)
                                    .reduce((acc, complied) => acc && complied, true)
    },
    {
        criterion: CRITERIA.logoDefined,
        evaluate: api => api.picture !== undefined && api.picture.length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: CRITERIA.viewsDefined,
        evaluate: api => api.views !== undefined && api.views.filter(view => !Object.keys(API_TYPES_VIEW_NAMES).includes(view)).length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: CRITERIA.functionalDocDefined,
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === FUNCTIONAL_DOC_TYPE && page.published).length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: CRITERIA.functionalDocHomePage,
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === FUNCTIONAL_DOC_TYPE && page.published && page.homepage).length > 0
    },
    {
        criterion: CRITERIA.technicalDocDefined,
        evaluate: api => api.pages !== undefined && api.pages.filter(page => page.type === TECHNICAL_DOC_TYPE && page.published).length > 0,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: CRITERIA.contextPathNamingConvention,
        evaluate: matchNamingConvention(api => api.proxy.context_path, command => command.argv['context-path-regex'])
    },
    {
        criterion: CRITERIA.endpointsNamingConvention,
        evaluate: function(api) {
            if (api.proxy.groups.length === 1) {
                return true;
            }
            const nonCompliantEndpoints = api.proxy.groups.filter(group =>
                group.endpoints !== undefined &&
                group.endpoints.filter(endpoint => !endpoint.name.startsWith(group.name + " - ")).length > 0);
            return nonCompliantEndpoints == null || nonCompliantEndpoints.length == 0;
        }
    },
    {
        criterion: CRITERIA.healthCheckActive,
        evaluate: api => api.services !== undefined && api.services["health-check"] !== undefined && api.services["health-check"].enabled,
        enabled: script => script.graviteeAutomationOverrideEnabled()
    },
    {
        criterion: CRITERIA.apiTypeViewDefined,
        evaluate: api => api.views !== undefined && api.views.filter(view => Object.keys(API_TYPES_VIEW_NAMES).includes(view)).length == 1
    },
];

/**
 * Extract quality criteria compliance corresponding to an API as a CSV content.
 *
 * @author Alexandre Carbenay
 */
class ExtractApiQuality extends CliCommand {

    constructor() {
        super(
            'extract-api-quality',
            {
                'api-id': {
                    describe: "API UUID. If not provided, extract API quality for all APIs",
                    type: 'string'
                },
                'delay-period': {
                    describe: "Delay period to temporize API broadcast",
                    type: 'number',
                    default: 200
                },
                'override-gravitee-automation': {
                    describe: "Override Gravitee quality metrics with custom quality rules. This could be useful if Gravitee quality feature is not enabled",
                    type: 'boolean',
                    default: false
                },
                'evaluate-runtime': {
                    describe: "Indicates whether the runtime criteria must be evaluated",
                    type: 'boolean',
                    default: false
                },
                'runtime-duration': {
                    describe: "Runtime time range duration",
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
                },
                'name-regex': {
                    describe: 'Regex for API name convention criterion evaluation',
                    type: 'string',
                    default: DEFAULT_API_NAME_REGEX
                },
                'version-regex': {
                    describe: 'Regex for API version convention criterion evaluation',
                    type: 'string',
                    default: DEFAULT_API_VERSION_REGEX
                },
                'context-path-regex': {
                    describe: 'Regex for API context-path convention criterion evaluation',
                    type: 'string',
                    default: DEFAULT_API_CONTEXT_PATH_REGEX
                }
            }
        );
    }

    definition(managementApi) {
        const elasticsearch = this.runtimeEvaluationEnabled()
            ? ElasticSearch.createInstance(new ElasticSearch.Settings(this.argv['elasticsearch-url'], this.argv['elasticsearch-url-header']))
            : undefined;

        const apiIds = managementApi.login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => this.argv['api-id'] !== undefined
                    ? Rx.of(this.argv['api-id'])
                    : managementApi.listApisBasics({}, this.argv['delay-period'], 30000).pipe(
                        map(api => api.id)
                    )
                )
            );

        const qualityFunctions = Rx.of(
            this.getGraviteeQuality,
            this.evaluateQualityFromDetail,
            this.validateSupportEmailDefined,
            this.evaluateRuntimeCriteria);
        apiIds.pipe(
            tap(apiId => this.displayInfo(util.format("Get quality metrics for API %s", apiId))),
            flatMap(apiId => qualityFunctions.pipe(
                flatMap(qualityFunction => qualityFunction.bind(this)(managementApi, elasticsearch, apiId)),
                reduce((acc, criteria) => acc.concat(criteria), []),
                map(criteria => criteria.sort((c1, c2) => c1.reference.localeCompare(c2.reference))),
                flatMap(criteria => managementApi.getApi(apiId).pipe(
                    map(api => Object.assign({api: api, type: this.getApiType(api), criteria: criteria}))
                ))
            )),
            reduce((acc, apiQuality) => acc.concat(apiQuality), [])
        ).subscribe(this.defaultSubscriber(
             apisQuality => {
                 this.displayInfo("CSV content:");
                 this.displayRaw("API id,API name,API type," + Object.values(CRITERIA).reduce((acc, criterion) => acc + criterion.reference + ",", ""));
                 apisQuality.forEach((apiQuality, i) =>
                     this.displayRaw(apiQuality.api.id + "," +
                                     apiQuality.api.name + "," +
                                     apiQuality.type + "," +
                                     Array.from(apiQuality.criteria).reduce((acc, criteria) => acc + criteria.complied + ",", ""))
                 );
             }
         ));
    }

    getApiType(api) {
        var apiTypes = api.views !== undefined ? api.views.filter(view => Object.keys(API_TYPES_VIEW_NAMES).includes(view)).map(view => API_TYPES_VIEW_NAMES[view]) : [];
        return apiTypes.length > 0 ? apiTypes[0] : DEFAULT_API_TYPE;
    }

    getGraviteeQuality(managementApi, elasticsearch, apiId) {
        return this.graviteeAutomationOverrideEnabled() ? Rx.EMPTY :
            managementApi.getQuality(apiId).pipe(
                map(quality => convertQualityCriteria(quality))
            );
    }

    evaluateQualityFromDetail(managementApi, elasticsearch, apiId) {
        return managementApi
            .export(apiId).pipe(
                flatMap(apiDetail => Rx.from(apiDetailsCriteriaEvaluators).pipe(
                        filter(evaluator => evaluator.enabled === undefined || evaluator.enabled(this)),
                        map(evaluator => new QualityCriterion(evaluator.criterion.description, evaluator.criterion.reference, evaluator.evaluate(apiDetail, this))),
                        reduce((acc, criteria) => acc.concat(criteria), [])
                ))
            );
    }

    validateSupportEmailDefined(managementApi, elasticsearch, apiId) {
        return managementApi
            .getApiMetadata(apiId).pipe(
                map(metadata => {
                    const complied = metadata.filter(data => data.key === "email-support" && data.value !== undefined && data.value.length > 0).length > 0;
                    const criterion = CRITERIA.supportEmailDefined;
                    return new QualityCriterion(criterion.description, criterion.reference, complied);
                })
            );
    }

    evaluateRuntimeCriteria(managementApi, elasticsearch, apiId) {
        if (!this.runtimeEvaluationEnabled()) {
            return Rx.EMPTY;
        }
        const runtimeQualityFunctions = Rx.of(
            this.evaluateResponseTimes,
            this.evaluateErrorsRatio,
            this.evaluateHealthCheckAvailability);
        return this.getApiAvailabilityThreshold(managementApi, apiId).pipe(
            flatMap(threshold => runtimeQualityFunctions.pipe(
                flatMap(qualityFunction => qualityFunction.bind(this)(managementApi, elasticsearch, threshold, apiId)),
                reduce((acc, criteria) => acc.concat(criteria), [])
            ))
        );
    }

    getApiAvailabilityThreshold(managementApi, apiId) {
        return managementApi.getApi(apiId).pipe(
            map(api => {
                if (api.labels !== undefined) {
                    var matches = api.labels.filter(label => matchNamingConvention(label => label, command => AVAILABILITY_LABEL_REGEX)(label));
                    if (matches.length === 1) {
                        return matches[0];
                    }
                }
                return DEFAULT_AVAILABILITY;
            }),
            map(availability => RUNTIME_THRESHOLDS[availability])
        );
    }

    evaluateErrorsRatio(managementApi, elasticsearch, threshold, apiId) {
        const aggregation = {
            "ErrorRatio": {
                "filters": {
                    "filters": {
                        "Errors": {
                            "query_string": {
                                "query": "status:[500 TO 599]"
                            }
                        }
                    }
                }
            }
        };
        return elasticsearch.aggregateHits(
            this.argv['elasticsearch-index'],
            aggregation,
            util.format("now-%s", this.argv['runtime-duration']),
            'now',
            [["api", apiId]]
        ).pipe(
            map(esResult => {
                var total = esResult.hits.total;
                var ratio = total == 0 ? 0 : esResult.aggregations.ErrorRatio.buckets.Errors.doc_count / total;
                var criteria = new Array();
                criteria.push(new QualityCriterion(CRITERIA.apiUsage.description, CRITERIA.apiUsage.reference, total > 0));
                criteria.push(new QualityCriterion(CRITERIA.errorsRatio.description, CRITERIA.errorsRatio.reference, threshold.errorsRatio > ratio));
                return criteria;
            })
        );
    }

    evaluateResponseTimes(managementApi, elasticsearch, threshold, apiId) {
        const aggregation = {
            "ResponseTime" : {
                "percentiles" : {
                    "field" : "response-time",
                    "percents" : [50, 95]
                }
            }
        };
        return elasticsearch.aggregateHits(
            this.argv['elasticsearch-index'],
            aggregation,
            util.format("now-%s", this.argv['runtime-duration']),
            'now',
            [["api", apiId]]
        ).pipe(
            map(esResult => Object.assign({
                '50': esResult.aggregations.ResponseTime.values['50.0'],
                '95': esResult.aggregations.ResponseTime.values['95.0']
            })),
            map(responseTimes => {
                var criteria = new Array();
                criteria.push(new QualityCriterion(
                    CRITERIA.responseTimeMedian.description,
                    CRITERIA.responseTimeMedian.reference,
                    responseTimes['50'] == 'NaN' || threshold.responseTimeMedian > responseTimes['50']));
                criteria.push(new QualityCriterion(
                    CRITERIA.responseTime95Percentile.description,
                    CRITERIA.responseTime95Percentile.reference,
                    responseTimes['95'] == 'NaN' || threshold.responseTime95Percentile > responseTimes['95']));
                return criteria;
            })
        );
    }

    evaluateHealthCheckAvailability(managementApi, elasticsearch, threshold, apiId) {
        return managementApi.getApiHealthCheckAvailability(apiId).pipe(
            map(response => response.global == undefined ? 0 : response.global[this.argv['runtime-duration']]),
            map(availability => new QualityCriterion(
                CRITERIA.healthCheckAvailability.description,
                CRITERIA.healthCheckAvailability.reference,
                availability > threshold.healthCheckAvailability))
        );
    }

    graviteeAutomationOverrideEnabled() {
        return this.argv['override-gravitee-automation'];
    }

    runtimeEvaluationEnabled() {
        return this.argv['evaluate-runtime'];
    }

}
new ExtractApiQuality().run();