function loader1(sourceCode) {
  console.log("join loader1");
  return sourceCode + `\n const loader1 ='this is loader 1'`;
}

module.exports = loader1;
