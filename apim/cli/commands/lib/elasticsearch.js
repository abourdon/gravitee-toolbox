const util = require('util');
const request = require('request-promise');
const Rx = require('rxjs');
const { catchError, concatMap, expand, filter, flatMap, map, reduce, take } = require('rxjs/operators')

const WILDCARD_INDEX = '-*';
const DEFAULT_TIMEOUT = 10000;

/**
 * Elasticsearch client instance.
 *
 * @author Alexandre Carbenay
 */
class ElasticSearch {

    /**
     * Create a new ElasticSearch client instance according to the given settings
     *
     * @param {object} elasticSearchSettings settings of this ElasticSearch client instance
     */
    constructor(elasticSearchSettings) {
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
            method: 'get',
            url: util.format('%s/_search', search.indexName),
            body: {
              "size": pageSize,
              "query": search.query,
              "sort": [
                {[search.timeKey]: "asc"},
                {"_id": "desc"}
              ]
            }
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
            method: 'get',
            url: util.format('%s/_search', search.indexName),
            body: {
              "size": 0,
              "query": search.query,
              "aggs" : aggregation
            },
            timeout: timeout
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
            method: 'post',
            url: util.format('%s/_delete_by_query', search.indexName),
            body: {
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
                        nextRequest.body.search_after = lastItem.sort;
                        return nextRequest;
                    }),
                    flatMap(request => this._request(request)
                        .pipe(
                            map(response => new ElasticSearchResult(request, response))
                        ))
                )
            : Rx.empty();
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

        // Set request and response content type to json and also enable automatic JSON parsing
        requestSettings.json = true;

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
        if (!requestSettings.strictSSL) {
            requestSettings.strictSSL = false;
        }

        // If no timeout is defined then set a default one to 10s
        if (!requestSettings.timeout) {
            requestSettings.timeout = DEFAULT_TIMEOUT;
        }

        return Rx.from(request(requestSettings));
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
    createInstance: function(settings) {
        return new ElasticSearch(settings);
    }
}