const { SyncHook } = require("tapable");
const { toUnixPath, tryExtensions, getSourceCode } = require("./utils");
const path = require("path");
const fs = require("node:fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;
const t = require("@babel/types");

class Compiler {
  constructor(options) {
    this.options = options;
    this.rootPath = this.options.context || toUnixPath(process.cwd());
    this.hooks = {
      // hooks before run
      run: new SyncHook(),
      // hooks before output the asset from mempry to disk
      emit: new SyncHook(),
      // hooks after compilation done
      done: new SyncHook(),
    };
    // store entry modules
    this.entries = new Set();
    // store dependent modules
    this.modules = new Set();
    // store code chunks
    this.chunks = new Set();
    // store assets
    this.assets = new Set();
    // store filenames
    this.files = new Set();
  }

  run(callback) {
    this.hooks.run.call();
    const entry = this.getEntry();
    // compile entry files
    this.buildEntryModule(entry);
    // 导出列表，将每个chunk转化为单独的文件加入到输出列表 assets 中
    this.exportFile(callback);
  }

  exportFile(callback) {
    const output = this.options.output;
    this.chunks.forEach((chunk) => {
      const parseFileName = output.filename.replace("[name]", chunk.name);
      this.assets[parseFileName] = getSourceCode(chunk);
    });

    this.hooks.emit.call();
    // check whether the output directory
    if (!fs.existsSync(output.path)) {
      fs.mkdirSync(output.path);
    }

    this.files = Object.keys(this.assets);

    Object.keys(this.assets).forEach((fileName) => {
      const filePath = path.join(output.path, fileName);
      fs.writeFileSync(filePath, this.assets[fileName]);
    });
    // trigger done hooks
    callback(null, {
      toJson: () => {
        return {
          entries: this.entries,
          modules: this.modules,
          files: this.files,
          chunks: this.chunks,
          assets: this.assets,
        };
      },
    });
  }

  buildEntryModule(entry) {
    Object.keys(entry).forEach((entryName) => {
      const entryPath = entry[entryName];
      const entryObj = this.buildModule(entryName, entryPath);

      this.entries.add(entryObj);
      this.buildUpChunk(entryName, entryObj);
    });
  }

  // 根据入口文件和依赖模块组装 chunks
  buildUpChunk(entryName, entryObj) {
    const chunk = {
      name: entryName, //每一个入口文件作为一个chunk
      entryModule: entryObj,
      modules: Array.from(this.modules).filter((i) =>
        i.name.includes(entryName)
      ),
    };
    this.chunks.add(chunk);
  }

  buildModule(moduleName, modulePath) {
    const originalSourceCode = (this.originalSourceCode = fs.readFileSync(
      modulePath,
      { encoding: "utf-8" }
    ));
    this.moduleCode = originalSourceCode;
    // use loader to process the code
    this.handleLoader(modulePath);

    // use webpack to compule the module and get the final module object
    const module = this.handleWebpackCompiler(moduleName, modulePath);

    return module;
  }

  // use webpack to compile module
  handleWebpackCompiler(moduleName, modulePath) {
    const moduleId = "./" + path.posix.relative(this.rootPath, modulePath);
    const module = {
      id: moduleId,
      dependencies: new Set(), // 该模块所以来模块绝对地址
      name: [moduleName], // 该模块所属的入口文件
    };

    const ast = parser.parse(this.moduleCode, {
      sourceType: "module",
    });

    traverse(ast, {
      CallExpression: (nodePath) => {
        const node = nodePath.node;
        if (node.callee.name === "require") {
          const requirePath = node.arguments[0].value;
          const moduleDirName = path.posix.dirname(modulePath);
          const absolutePath = tryExtensions(
            path.posix.join(moduleDirName, requirePath),
            this.options.resolve.extensions,
            requirePath,
            moduleDirName
          );
          const moduleId =
            "./" + path.posix.relative(this.rootPath, absolutePath);
          node.callee = t.identifier("__webpack_require__");
          node.arguments = [t.stringLiteral(moduleId)];

          const alreadyModules = Array.from(this.modules).map((i) => i.id);
          if (!alreadyModules.includes(moduleId)) {
            module.dependencies.add(moduleId);
          } else {
            this.modules.forEach((value) => {
              if (value.id === moduleId) {
                value.name.push(moduleName);
              }
            });
          }
        }
      },
    });
    const { code } = generator(ast);
    module._source = code;
    module.dependencies.forEach((dependency) => {
      const depModule = this.buildModule(moduleName, dependency);
      this.modules.add(depModule);
    });
    return module;
  }

  handleLoader(modulePath) {
    const matchLoaders = [];

    const rules = this.options.module.rules;
    rules.forEach((loader) => {
      const testRule = loader.test;
      if (testRule.test(modulePath)) {
        if (loader.loader) {
          matchLoaders.push(loader.loader);
        } else {
          matchLoaders.push(...loader.use);
        }
      }
    });

    for (let i = matchLoaders.length - 1; i >= 0; i--) {
      const loaderFn = require(matchLoaders[i]);
      this.moduleCode = loaderFn(this.moduleCode);
    }
  }

  getEntry() {
    let entry = Object.create(null);
    const { entry: optionsEntry } = this.options;
    if (typeof optionsEntry === "string") {
      entry["main"] = optionsEntry;
    } else {
      entry = optionsEntry;
    }

    Object.keys(entry).forEach((key) => {
      const value = entry[key];
      if (!path.isAbsolute(value)) {
        entry[key] = toUnixPath(path.join(this.rootPath, value));
      }
    });
    return entry;
  }
}

module.exports = Compiler;
