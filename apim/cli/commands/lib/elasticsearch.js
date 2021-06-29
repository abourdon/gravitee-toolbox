const util = require('util');
const gaxios = require('gaxios');
const Rx = require('rxjs');
const https = require('https');
const { catchError, concatMap, expand, filter, mergeMap, map, reduce, take } = require('rxjs/operators')

const WILDCARD_INDEX = '-*';
const DEFAULT_TIMEOUT = 120000; // in ms
const DEFAULT_RETRY_DELAY = 5000; // in ms
const DEFAULT_RETRY_ATTEMPT = 3;
const DEFAULT_STATUS_CODES_TO_RETRY = [[100, 199], [408, 408], [429, 429], [500, 599]];

/**
 * Elasticsearch client instance.
 *
 * @author Alexandre Carbenay
 */
class ElasticSearch {

    /**
     * Create a new ElasticSearch client instance according to the given settings
     *
     * @param {object} console the Console allowing this ManagementAPI instance to display log to user
     * @param {object} elasticSearchSettings settings of this ElasticSearch client instance
     */
    constructor(console, elasticSearchSettings) {
        this.console = console;
        this.settings = elasticSearchSettings;
    }

    /**
     * Search hits in indexes corresponding to the specified search.
     *
     * @param {object} Search object containing query and index
     * @param {number} page size (default = 100)
     * @return a stream of Elasticsearch documents
     */
    searchHits(search, pageSize = 100) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/%s/_search', search.indexName),
            data: {
              "size": pageSize,
              "query": search.query,
              "sort": [
                {[search.timeKey]: "asc"},
                {"_id": "desc"}
              ]
            },
            retry: true
        };
        return (pageSize > 0) ? this._requestAllPages(requestSettings) : this._request(requestSettings);
    }

    /**
     * Aggregates hits from indexes corresponding to the specified search.
     *
     * @param {object} Search object containing query and index
     * @param {string} aggregation definition.
     * @return a stream of Elasticsearch aggregations.
     */
    aggregateHits(search, aggregation, timeout = DEFAULT_TIMEOUT) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/%s/_search', search.indexName),
            data: {
              "size": 0,
              "query": search.query,
              "aggs" : aggregation
            },
            timeout: timeout,
            retry: true
        };
        return this._request(requestSettings);
    }

    /**
     * Deletes hits from indexes corresponding to the specified search.
     *
     * @param {object} Search object containing query and index
     * @return the deletion result.
     */
    deleteByQuery(search) {
        const requestSettings = {
            method: 'POST',
            url: util.format('/%s/_delete_by_query', search.indexName),
            data: {
              "query": search.query
            }
        };
        return this._request(requestSettings);
    }

    /**
     * Do a request to Elasticsearch, handling pagination.
     * This implies running multiple requests to Elasticsearch and concatenating responses.
     *
     * @param {object} requestDetails details of the Elasticsearch request
     * @return a stream of Elasticsearch documents with additional metadata (e.g. total of documents)
     */
    _requestAllPages(request) {
        return this._request(request)
            .pipe(
                map(response => new ElasticSearchResult(request, response)),
                expand(this._requestNextPage.bind(this)),
                concatMap(result => result.response.hits.hits.map(hit => {
                    return {
                        meta: {
                            total: result.response.hits.total
                        },
                        hit: hit
                    };
                }))
            );
    }

    /*
     * Do a request to Elasticsearch for the page next to the specified result.
     * Building request for the next page requires information from the previous request and its response.
     *
     * @param {object} result of the previous Elasticsearch request
     * @return the result of the last Elasticsearch request
     */
    _requestNextPage(previousResult) {
        return previousResult.response.hits.hits.length > 0
            ? Rx.of(previousResult)
                .pipe(
                    map(result => {
                        const nextRequest = Object.assign({}, result.request);
                        const lastItem = result.response.hits.hits[result.response.hits.hits.length - 1];
                        nextRequest.data.search_after = lastItem.sort;
                        return nextRequest;
                    }),
                    mergeMap(request => this._request(request)
                        .pipe(
                            map(response => new ElasticSearchResult(request, response))
                        ))
                )
            : Rx.EMPTY;
    }

    /**
     * Do a request to Elasticsearch
     *
     * @param {object} requestDetails details of the Elasticsearch request
     * @return the response to the request
     */
    _request(requestDetails) {
        const requestSettings = Object.assign({}, requestDetails);

        requestSettings.baseUrl = this.settings.esUrl;

        if (this.settings.esHeaders !== undefined) {
            if (requestSettings.headers === undefined) {
                requestSettings.headers = {};
            }
            this.settings.esHeaders.forEach(header => {
                const colonIndex = header.indexOf(':');
                const headerName = header.substring(0, colonIndex);
                const headerValue = header.substring(colonIndex+1);
                requestSettings.headers[headerName] = headerValue;
            });
        }

        // Trust any SSL/TLS HTTP certificate by default
        if (!requestSettings.httpsAgent) {
            requestSettings.httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });
        }

        // If no timeout is defined then set a default one to DEFAULT_TIMEOUT
        if (!requestSettings.timeout) {
            requestSettings.timeout = DEFAULT_TIMEOUT;
        }

        // Any GET requests are retried by default
        if (requestSettings.method === 'GET') {
            requestSettings.retry = true;
        }
        // If a retry mechanism has been set, then apply the default configuration if necessary
        if (requestSettings.retry) {
            if (!requestSettings.retryConfig) {
                requestSettings.retryConfig = {};
            }
            if (!requestSettings.retryConfig.retry) {
                requestSettings.retryConfig.retry = DEFAULT_RETRY_ATTEMPT;
            }
            if (!requestSettings.retryConfig.noResponseRetry) {
                requestSettings.retryConfig.noResponseRetry = DEFAULT_RETRY_ATTEMPT;
            }
            if (!requestSettings.retryConfig.retryDelay) {
                requestSettings.retryConfig.retryDelay = DEFAULT_RETRY_DELAY;
            }
            if (!requestSettings.retryConfig.statusCodesToRetry) {
                requestSettings.retryConfig.statusCodesToRetry = DEFAULT_STATUS_CODES_TO_RETRY;
            }
            if (!requestSettings.retryConfig.onRetryAttempt) {
                const localConsole = this.console;
                requestSettings.retryConfig.onRetryAttempt = function (err) {
                    localConsole.warn(util.format("Error in calling the ElasticSearch API (%s, %s). Retrying...", err.code, err.message));
                };
            }
            requestSettings.retryConfig.httpMethodsToRetry = [requestSettings.method];
        }

        // Trace HTTP request
        this.console.debug(util.format('Calling %s%s', requestSettings.baseURL, requestSettings.url));

        // Finally do the request and extract answer payload
        return Rx.from(gaxios.request(requestSettings)).pipe(
            map(answer => answer.data)
        );
    }
}

ElasticSearch.Search = class {
    /**
     * @param {string} elasticsearch index name (default = 'gravitee-request-*')
     * @param {map} search terms (optional)
     * @param {string} time range lower bound (default = 'now-1M')
     * @param {string} time range upper bound (default = 'now')
     * @param {string} time key in index (default = '@timestamp')
     */
    constructor(indexName = 'gravitee-request-*', searchTerms = [], from = 'now-1M', to = 'now', timeKey = '@timestamp') {
        const terms = Array.from(searchTerms)
            .map(([key, value]) => ({ "term": { [key]: { "value": value } } }))
            .reduce((acc, term) => acc.concat(term), []);
        if (indexName.endsWith(WILDCARD_INDEX)) {
            terms.push({"range":{[timeKey]:{"gte":from,"lte":to}}});
        }

        this.indexName = indexName;
        this.timeKey = timeKey;
        this.query =
        {
          "bool": {
            "must": [
              terms
            ]
          }
        };
    }
}

/**
 * Associated settings to any ElasticSearch instance
 */
ElasticSearch.Settings = class {
    constructor(esUrl, esHeaders) {
        if (esUrl === null || esUrl === undefined) {
            throw new Error('Cannot build ElasticSearch client instance with no URL');
        }
        this.esUrl = esUrl;
        this.esHeaders = esHeaders;
    }
}

/**
 * Elasticsearch request / response tuple enabling pagination.
 * We need to store result of a request to create requests for next pages, as Elasticsearch do not return current page in responses.
 */
ElasticSearchResult = class {
    constructor(request, response) {
        this.request = request;
        this.response = response;
    }
}

module.exports = {
    Search: ElasticSearch.Search,
    Settings: ElasticSearch.Settings,
    createInstance: function(console, settings) {
        return new ElasticSearch(console, settings);
    }
}