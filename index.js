'use strict';

var find = require('find'),
    fs = require('fs'),
    Q = require('q'),
    path = require('path');

function readFile(filename) {
    return Q.nfcall(fs.readFile, filename, 'utf-8');
}

function searchFile(data) {
    return function (content) {
        var match = content.match(data.regex),
            linesMatch = content.match(data.lineRegEx);

        return {
            filename: data.filename,
            match: match,
            lines: linesMatch,
        };
    };
}

function getFileFilter(fileFilter) {
    if (typeof fileFilter === 'string') {
        fileFilter = new RegExp(fileFilter);
    } else if (typeof fileFilter === 'undefined') {
        fileFilter = new RegExp('.');
    }
    return fileFilter;
}

function getRegEx(pattern, regex) {
    var flags, term, grabLineRegEx;

    if (typeof pattern === 'object' && pattern.flags) {
        term = pattern.term;
        flags = pattern.flags;
    } else {
        term = pattern;
        flags = 'g';
    }

    grabLineRegEx = '(.*' + term + '.*)';

    if (regex === 'line') {
        return new RegExp(grabLineRegEx, flags);
    }

    return new RegExp(term, flags);
}

function getMatchedFiles(pattern, files) {
    var matchedFiles = [];
    for (var i = files.length - 1; i >= 0; i--) {
        matchedFiles.push(
            readFile(files[i]).then(
                searchFile({
                    regex: getRegEx(pattern),
                    lineRegEx: getRegEx(pattern, 'line'),
                    filename: files[i],
                })
            )
        );
    }

    return matchedFiles;
}

function getResults(content) {
    var results = {};

    for (var i = 0; i < content.length; i++) {
        var fileMatch = content[i].value;
        if (fileMatch && fileMatch.match !== null) {
            results[fileMatch.filename] = {
                matches: fileMatch.match,
                count: fileMatch.match.length,
                line: fileMatch.lines,
            };
        }
    }

    return results;
}

exports.find = function (pattern, directory, fileFilter) {
    var deferred = Q.defer();
    find.file(getFileFilter(fileFilter), directory, function (files) {
        Q.allSettled(getMatchedFiles(pattern, files))
            .then(function (content) {
                deferred.resolve(getResults(content));
            })
            .done();
    }).error(function (err) {
        deferred.reject(err);
    });
    return deferred.promise;
};

exports.findSync = function (pattern, directory, fileFilter) {
    var deferred = Q.defer();
    var files;
    try {
        files = find.fileSync(getFileFilter(fileFilter), directory);
        Q.allSettled(getMatchedFiles(pattern, files))
            .then(function (content) {
                deferred.resolve(getResults(content));
            })
            .done();
    } catch (err) {
        deferred.reject(err);
    }
    return deferred.promise;
};

/**
 * check if pattern exist in at least 1 file
 * @param {*} pattern
 * @param {*} directories
 * @param {*} fileFilter
 * @returns true - at least 1 match found, false - no match found in files
 */
exports.matchFound = function (pattern, directories, fileFilter) {
    var files = [];

    for (const directory of directories) {
        files = files.concat(find.fileSync(getFileFilter(fileFilter), directory));
    }

    // return on 1st match for better performance
    for (var i = files.length - 1; i >= 0; i--) {
        var content = fs.readFileSync(files[i], { encoding: 'utf-8' });
        if (!!content.match(getRegEx(pattern))) {
            return true;
        }
    }
    return false;
};

/**
 * find pattern in files, and return the 1st capturing group in an array
 * @param {*} regex
 * @param {*} directories
 * @param {*} fileFilter
 * @returns string[]
 */
exports.getArrayOfCapturingGroup = function (regex, directories, fileFilter) {
    var files = [];
    var keys = new Set();

    for (const directory of directories) {
        files = files.concat(find.fileSync(getFileFilter(fileFilter), directory));
    }

    for (var i = files.length - 1; i >= 0; i--) {
        var content = fs.readFileSync(files[i], { encoding: 'utf-8' });
        var matchAll = content.matchAll(regex);

        [...matchAll].forEach((match) => {
            keys.add(match[1]);
        });
    }

    return keys;
};
