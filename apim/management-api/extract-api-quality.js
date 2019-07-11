const ManagementApiScript = require('./lib/management-api-script');
const { QualityCriterion, convertQualityCriteria } = require('./lib/quality-criteria-converter');
const Rx = require('rxjs')
const { flatMap, map, reduce } = require('rxjs/operators');

/*
 * API name is composed of:
 * - eventually a namespace (potentially multiple words)
 * - a resource or provider (potentially multiple words)
 * - eventually a country
 * Example: Multiple words namespace - Resource or provider - Country
 */
const API_NAME_REGEX = /^(\w+( \w+)* \- )?\w+( \w+)*( \- \w+)?$/;
/*
 * Version is prefixed with a "v" and composed of one or more digits
 */
const API_VERSION_REGEX = /v\d+/;
/*
 * Context path is composed of:
 * - a context (e.g. "corp" or country in 2 letters)
 * - eventually a namespace (potentially multiple words separated with - or _)
 * - a version starting with "v" and ending with digits
 * - a resource (potentially multiple words separated with - or _)
 * - eventually a sub resource (potentially multiple words separated with - or _)
 * Example: /corp/composed-namespace/v1/composed-resource/sub-resource
 */
const API_CONTEXT_PATH_REGEX = /^\/(corp|fr|lu|pl|hu|ro|pt|uk|ru|es)(\/\w+((-|_)\w+)?)?\/v\d+\/\w+((-|_)\w+)?(\/\w+((-|_)\w+)?)?$/;
/*
 * Data classification labels are composed of:
 * - a confidentiality label as C0, C1, C2 or C3
 * - an integrity label as I1, I2 or I3
 * - an availability label as A1, A2 or A3
 */
const CONFIDENTIALITY_LABEL_REGEX = /^C[0-3]$/;
const INTEGRITY_LABEL_REGEX = /^I[1-3]$/;
const AVAILABILITY_LABEL_REGEX = /^A[1-3]$/;

const matchNamingConvention = function(valueSelector, regex, apiDetail) {
    return apiDetail => {
        const matches = valueSelector(apiDetail).match(regex);
        return matches != null && matches.length > 0;
    }
}

const criterionEvaluators = [
    {
        name: "Name's naming convention complied",
        reference: "DF01",
        evaluate: matchNamingConvention(api => api.name, API_NAME_REGEX)
    },
    {
        name: "Version's naming convention complied",
        reference: "DF02",
        evaluate: matchNamingConvention(api => api.version, API_VERSION_REGEX)
    },
    {
        name: "Data classification labels complied",
        reference: "DF06",
        evaluate: apiDetail => [CONFIDENTIALITY_LABEL_REGEX, INTEGRITY_LABEL_REGEX, AVAILABILITY_LABEL_REGEX]
                                    .map(regex => matchNamingConvention(label => label, regex))
                                    .map(regexEvaluator => apiDetail.labels !== undefined &&
                                                           apiDetail.labels.filter(label => regexEvaluator(label)).length == 1)
                                    .reduce((acc, complied) => acc && complied, true)
    },
    {
        name: "Functional documentation published as home page",
        reference: "DF13",
        evaluate: apiDetail => apiDetail.pages.filter(page => page.type === "MARKDOWN" && page.published && page.homepage).length > 0
    },
    {
        name: "Context-path's naming convention complied",
        reference: "DF18",
        evaluate: matchNamingConvention(api => api.proxy.context_path, API_CONTEXT_PATH_REGEX)
    },
    {
        name: "Groups of endpoints and endpoints naming convention complied",
        reference: "DF19",
        evaluate: function(apiDetail) {
            const nonCompliantEndpoints = apiDetail.proxy.groups.filter(group =>
                group.endpoints !== undefined &&
                group.endpoints.filter(endpoint => !endpoint.name.startsWith(group.name + " - ")).length > 0);
            return nonCompliantEndpoints == null || nonCompliantEndpoints.length == 0;
        }
    },
];

/**
 * Extract quality criteria compliance corresponding to an API as a CSV content.
 *
 * @author Alexandre Carbenay
 */
class ExtractApiQuality extends ManagementApiScript {

    constructor() {
        super(
            'extract-api-quality',
            {
                'api-id': {
                    describe: "API UUID",
                    type: 'string',
                    demandOption: true
                },
            }
        );
    }

    definition(managementApi) {
        const qualityFunctions = Rx.of(
            this.getGraviteeQuality,
            this.evaluateQualityFromDetail,
            this.validateSupportEmailDefined);
        qualityFunctions.pipe(
            flatMap(qualityFunction => qualityFunction.bind(this)(managementApi)),
            reduce((acc, criteria) => acc.concat(criteria), [])
        ).subscribe(this.defaultSubscriber(
             criteria => {
                 this.displayInfo("CSV content:");
                 this.displayRaw(Array.from(criteria).reduce((acc, criteria) => acc + criteria.reference + ",", ""));
                 this.displayRaw(Array.from(criteria).reduce((acc, criteria) => acc + criteria.complied + ",", ""));
             }
         ));
    }

    getGraviteeQuality(managementApi) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getQuality(this.argv['api-id']).pipe(
                    map(quality => convertQualityCriteria(quality))
                ))
            );
    }

    evaluateQualityFromDetail(managementApi) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.export(this.argv['api-id']).pipe(
                    flatMap(apiDetail => Rx.from(criterionEvaluators).pipe(
                            map(evaluator => new QualityCriterion(evaluator.name, evaluator.reference, evaluator.evaluate(apiDetail))),
                            reduce((acc, criteria) => acc.concat(criteria), [])
                    ))
                ))
            );
    }

    validateSupportEmailDefined(managementApi) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getApiMetadata(this.argv['api-id']).pipe(
                    map(metadata => {
                        const complied = metadata.filter(data => data.key === "email-support" && data.value !== undefined && data.value.length > 0).length > 0;
                        return new QualityCriterion("Support email address defined", "DF17", complied);
                    })
                ))
            );
    }

}
new ExtractApiQuality().run();