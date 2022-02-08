import { EraIndex } from '@polkadot/types/interfaces';
import { Logger } from '@w3f/logger';
import { dataFileName } from '../constants'
import readline from 'readline';
import {
    InputConfig,
} from '../types';
import { closeFile, getFileNames, initReadFileStream, initWriteFileStream, isDirEmpty, isDirExistent, isNewEraEvent, makeDir } from '../utils';
import { writeHistoricErasCSV } from '../csvWriter';
import { gatherChainDataHistorical } from '../dataGathererHistoric';
import { ISubscriber } from './ISubscriber';
import { SubscriberTemplate } from './subscriberTemplate';

export class SubscriberEraScanner extends SubscriberTemplate implements ISubscriber {
    private config: InputConfig;

    private eraIndex: EraIndex;

    private dataDir: string
    private dataFileName = dataFileName

    private isScanOngoing = false //lock for concurrency
    private isNewScanRequired = false
    
    constructor(
        cfg: InputConfig,
        protected readonly logger: Logger) {
        super(cfg,logger)
        this.config=cfg
        this.dataDir = cfg.eraScanner?.dataDir
    }

    public start = async (): Promise<void> => {

        this.logger.info('Era Scanner mode active')
        
        await this._initAPI();
        await this._initInstanceVariables();
        this._initExportDir();
        await this._initDataDir()

        await this._handleEventsSubscriptions() // scan immediately after a event detection
        this.logger.info(`Event Scanner Based Module subscribed...`)

        this._requestNewScan() //first scan after a restart
    }

    private _initDataDir = async (): Promise<void> =>{
      if ( ! isDirExistent(this.dataDir) ) {
        makeDir(this.dataDir)
      }

      if( isDirEmpty(this.dataDir) || !getFileNames(this.dataDir,this.logger).includes(this.dataFileName) || ! await this._getLastCheckedEra()){
        const firstEraToScan = this.config.eraScanner?.startFromEra ? this.config.eraScanner?.startFromEra : this.eraIndex.toNumber()-2 // from config or current era -2
        const file = initWriteFileStream(this.dataDir,this.dataFileName,this.logger)
        file.write(`${firstEraToScan}`)
        await closeFile(file)
      }
    }

    private _initInstanceVariables = async (): Promise<void> =>{
      this.eraIndex = (await this.api.query.staking.activeEra()).unwrap().index;
      this.logger.info(`Current Era: ${this.eraIndex}`)
    }

    private _handleEventsSubscriptions = async (): Promise<void> => {
      this.api.query.system.events((events) => {
        events.forEach(async (record) => {
          const { event } = record;
          if(isNewEraEvent(event,this.api)){
            const era = (await this.api.query.staking.activeEra()).unwrap().index
            if(era != this.eraIndex) this._handleEraChange(era)
          } 
        })
      })
    }

    private _requestNewScan = async (): Promise<void> => {
      if(this.isScanOngoing){
        /*
        A new scan can be trigger asynchronously for various reasons (see the subscribe function above). 
        To ensure an exactly once detection and delivery, only one scan is allowed at time.  
        */
        this.isNewScanRequired = true
        this.logger.info(`new scan queued...`)
      }
      else{
        try {
          do {
            this.isScanOngoing = true
            this.isNewScanRequired = false
            await this._triggerEraScannerActions()
            /*
            An additional scan will be processed immediately if queued by any of the triggers.
            */
          } while (this.isNewScanRequired);
        } catch (error) {
          this.logger.error(`last SCAN had an issue at era ${await this._getLastCheckedEra()}!: ${error}`)
          this.logger.warn('quitting...')
          process.exit(-1);
        } finally {
          this.isScanOngoing = false
        }
      } 
    }

    private  _triggerEraScannerActions = async (): Promise<void> => {
      while(await this._getLastCheckedEra()<this.eraIndex.toNumber()-1){
        const tobeCheckedEra = await this._getLastCheckedEra()+1
        this.logger.info(`starting the CSV writing for the era ${tobeCheckedEra}`)
        await this._writeEraCSVHistoricalSpecific(tobeCheckedEra)
        await this._updateLastCheckedEra(tobeCheckedEra)
        await this._uploadToBucket()
      }
    }

    private _writeEraCSVHistoricalSpecific = async (era: number): Promise<void> => {
      const network = this.chain.toString().toLowerCase()
      const eraIndex = this.api.createType("EraIndex",era)

      const request = {api:this.api,network,exportDir:this.exportDir,eraIndexes:[eraIndex]}
      const chainData = await gatherChainDataHistorical(request, this.logger)
      await writeHistoricErasCSV(request, chainData, this.logger)
    }

    private _handleEraChange = async (newEra: EraIndex): Promise<void> =>{
      this.eraIndex = newEra
      this._requestNewScan()
    }

    private _getLastCheckedEra = async (): Promise<number> => {
      const file = initReadFileStream(this.dataDir,this.dataFileName,this.logger)
      const rl = readline.createInterface({
        input: file,
        crlfDelay: Infinity
      });
      
      let lastCheckedEra: number
      for await (const line of rl) {
        // Each line in input.txt will be successively available here as `line`.
        //console.log(`Line from file: ${line}`);
        lastCheckedEra = Number.parseInt(line)
      }
      await closeFile(file)

      return lastCheckedEra
    }

    private _updateLastCheckedEra = async (eraIndex: number): Promise<boolean> => {
      const file = initWriteFileStream(this.dataDir,this.dataFileName,this.logger)
      const result = file.write(eraIndex.toString())
      await closeFile(file)
      return result
    }

}
