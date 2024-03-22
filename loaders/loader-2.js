function loader2(sourceCode) {
  console.log("join loader2");
  return sourceCode + `\n const loader2= 'this is loader 2'`;
}

module.exports = loader2;
