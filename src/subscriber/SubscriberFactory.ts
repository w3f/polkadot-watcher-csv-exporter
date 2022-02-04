import { Logger } from "@w3f/logger";
import { InputConfig } from "../types";
import { ISubscriber } from "./ISubscriber";
import { Subscriber } from "./subscriber";
import { SubscriberEraScanner } from "./subscriberEraScanner";

export class SubscriberFactory {
  constructor(private readonly cfg: InputConfig, private readonly logger: Logger){}
  makeSubscriber = (): ISubscriber => {

    if(this.cfg.eraScanner?.enabled )
      return new SubscriberEraScanner(this.cfg,this.logger)
    else
      return new Subscriber(this.cfg,this.logger)     
  }
}