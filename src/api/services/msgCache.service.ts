import NodeCache from 'node-cache';
import { WAMessage, WAMessageKey } from "baileys";
import {Logger} from "@config/logger.config"; // ajuste o path conforme seu projeto

class MsgCacheService {
    private cache: NodeCache;
    public readonly logger = new Logger('MsgCacheService');

    constructor() {
        this.cache = new NodeCache({
            stdTTL: 60,
            maxKeys: 5000,
            checkperiod: 300,
            useClones: false,
        });
    }

    get(key: WAMessageKey): any | undefined {
        const { id } = key;
        if (!id) return;

        const data = this.cache.get<string>(id);
        if (data) {
            try {
                const msg: WAMessage = JSON.parse(data);
                return msg?.message;
            } catch (error) {
                this.logger.error(error);
            }
        }
    }

    save(msg: WAMessage): void {
        const { id } = msg.key;
        const msgtxt = JSON.stringify(msg);
        try {
            this.cache.set(id as string, msgtxt);
        } catch (error) {
            this.logger.error(error);
        }
    }
}

export default MsgCacheService;
