String.prototype.gsub = function(re, callback) {
  var result = '',
      source = this,
      match;
  
  while (source.length > 0) {
    if (match = re.exec(source)) {
      result += source.slice(0, match.index);
      result += callback(match);
      source  = source.slice(match.index + match[0].length);
    } else {
      result += source;
      source = '';
    }
  }
  
  return result;
};
