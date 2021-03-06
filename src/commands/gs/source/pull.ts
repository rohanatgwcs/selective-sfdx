import {core, flags, SfdxCommand} from '@salesforce/command';
import {AnyJson} from '@salesforce/ts-types';
import jsToXml = require('js2xmlparser');
import fs = require('fs-extra');
import shellJS = require('shelljs');
import emoji = require('node-emoji');

const options = {
  declaration: {
    include: true,
    encoding: 'UTF-8',
    version: '1.0'
  },
  format: {
    doubleQuotes: true
  }
};

// Initialize Messages with the current plugin directory
core.Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = core.Messages.loadMessages('selective-sfdx', 'pull');

const pkgDir = 'pkgDirTemp';

export default class Pull extends SfdxCommand {
  //This static variable sets the command description for help
  public static description = messages.getMessage('pullCommandDescription');

  public static examples = [
    `sfdx gs:source:pull --type ApexClass --names MyClass1,MyClass2 --targetdir app/main/default/classes
    // retrieves MyClass1 and MyClass2 from an org (sratch/non-scratch) to the provided directory location
    `,
    `sfdx gs:source:pull --type Layout --names Layout1 --targetdir app/main/default --includedir
    // retrieves Layout1 along with the layouts folder from an org (sratch/non-scratch) to the provided directory location
    `];

  //This static variale sets the flags/params for the commands along with
  //their description for the help
  protected static flagsConfig = {
    // flag with a value (-n, --name=VALUE)
    names: flags.array({char: 'n', required: true, description: messages.getMessage('nameFlagDescription')}),
    type: flags.string({char: 't', required: true, description: messages.getMessage('typeFlagDescription')}),
    targetdir: flags.string({char: 'd', required: true, description: messages.getMessage('targetdirFlagDescription')}),
    includedir: flags.boolean({char: 'i', description: messages.getMessage('includedirFlagDescription')})
  };

  //This static variable makes the org username required for the command
  protected static requiresUsername = true;

  public async run(): Promise<AnyJson> {
    //Setting some initial messages for the command when it runs
    let outputString = emoji.emojify(`Grabbing :truck:  metadata for you from :cloud:  with Id ${this.org.getOrgId()}. Meanwhile you can :eyes:  away from the :desktop_computer:  for 20 seconds!`);
    this.ux.log(outputString);
    this.ux.log(emoji.emojify(`:rocket:  Working on it................................... :rocket:`));

    //Creating the pckgDir directory which acts as temporary location
    //to retreive the package and perform necessary actions during the command run
    //fs.ensureDirSync(this.flags.targetdir);
    fs.ensureDirSync(pkgDir);

    const packageJSON = {
      '@': {
        xmlns: 'http://soap.sforce.com/2006/04/metadata'
      },
      types: [],
      version: await this.org.retrieveMaxApiVersion()
    };

    packageJSON.types.push({
      members: this.flags.names,
      name: this.flags.type
    });

    let packageXMl = jsToXml.parse('Package', packageJSON, options);
    fs.writeFileSync(`./${pkgDir}/package.xml`, packageXMl);
    let output = shellJS.exec(`sfdx force:mdapi:retrieve -k ${pkgDir}/package.xml -r ./${pkgDir} -w 30 -u ${this.org.getUsername()} --json`);

    shellJS.exec(`unzip -qqo ./${pkgDir}/unpackaged.zip -d ./${pkgDir}`);
    shellJS.exec(`rm -rf ./${pkgDir}/unpackaged.zip`);
    shellJS.exec(`rm -rf ./${pkgDir}/unpackaged/package.xml`);

    //Get the list of all the folders inside the newly unzipped folder
    async function getDirectories(path){
        let filesAndDirectories = await fs.readdir(path);

        let directories = [];
        await Promise.all(
            filesAndDirectories.map(name =>{
                return fs.stat(path + name)
                .then(stat =>{
                    if(stat.isDirectory()) directories.push(name)
                })
            })
        );
        return directories;
    }

    let directories = await getDirectories(`${pkgDir}/unpackaged/`);

    //Copy over all the contents from one folder(first one, assuming there would alwyas be one folder)
    //to the provided target directory
    let source = this.flags.includedir?`${pkgDir}/unpackaged`:`${pkgDir}/unpackaged/${directories[0]}`;
    fs.copy(source, `${this.flags.targetdir}`)
    .then(() => {
      shellJS.exec(`rm -rf ./${pkgDir}`);
    })
    .catch(err => {
      console.error(err);
    });

    // Return an object to be displayed with --json
    return { output };
  }
}
