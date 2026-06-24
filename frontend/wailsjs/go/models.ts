export namespace discover {
	
	export class Repository {
	    fullName: string;
	    description: string;
	    language: string;
	    stars: number;
	    forks: number;
	    url: string;
	    ownerLogin: string;
	    ownerAvatarUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new Repository(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fullName = source["fullName"];
	        this.description = source["description"];
	        this.language = source["language"];
	        this.stars = source["stars"];
	        this.forks = source["forks"];
	        this.url = source["url"];
	        this.ownerLogin = source["ownerLogin"];
	        this.ownerAvatarUrl = source["ownerAvatarUrl"];
	    }
	}
	export class Result {
	    repositories: Repository[];
	    errors: string[];
	    unauthorized: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.repositories = this.convertValues(source["repositories"], Repository);
	        this.errors = source["errors"];
	        this.unauthorized = source["unauthorized"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace feed {
	
	export class Item {
	    id: string;
	    actor: string;
	    avatarUrl: string;
	    type: string;
	    action: string;
	    target: string;
	    targetUrl: string;
	    trailer: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.actor = source["actor"];
	        this.avatarUrl = source["avatarUrl"];
	        this.type = source["type"];
	        this.action = source["action"];
	        this.target = source["target"];
	        this.targetUrl = source["targetUrl"];
	        this.trailer = source["trailer"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Result {
	    items: Item[];
	    errors: string[];
	    unauthorized: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], Item);
	        this.errors = source["errors"];
	        this.unauthorized = source["unauthorized"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class DeviceLogin {
	    userCode: string;
	    verificationUri: string;
	    deviceCode: string;
	    expiresIn: number;
	    interval: number;
	
	    static createFrom(source: any = {}) {
	        return new DeviceLogin(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.userCode = source["userCode"];
	        this.verificationUri = source["verificationUri"];
	        this.deviceCode = source["deviceCode"];
	        this.expiresIn = source["expiresIn"];
	        this.interval = source["interval"];
	    }
	}
	export class FollowingAccount {
	    login: string;
	    avatarUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new FollowingAccount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.login = source["login"];
	        this.avatarUrl = source["avatarUrl"];
	    }
	}
	export class FollowingResult {
	    accounts: FollowingAccount[];
	    truncated: boolean;
	    errors: string[];
	    unauthorized: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FollowingResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accounts = this.convertValues(source["accounts"], FollowingAccount);
	        this.truncated = source["truncated"];
	        this.errors = source["errors"];
	        this.unauthorized = source["unauthorized"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Settings {
	    hasToken: boolean;
	    login: string;
	    users: string[];
	    maxUsers: number;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasToken = source["hasToken"];
	        this.login = source["login"];
	        this.users = source["users"];
	        this.maxUsers = source["maxUsers"];
	    }
	}

}

export namespace notifications {
	
	export class Item {
	    id: string;
	    actor: string;
	    avatarUrl: string;
	    type: string;
	    action: string;
	    target: string;
	    targetUrl: string;
	    trailer: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.actor = source["actor"];
	        this.avatarUrl = source["avatarUrl"];
	        this.type = source["type"];
	        this.action = source["action"];
	        this.target = source["target"];
	        this.targetUrl = source["targetUrl"];
	        this.trailer = source["trailer"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Result {
	    items: Item[];
	    errors: string[];
	    unauthorized: boolean;
	    unreadCount: number;
	    minPollIntervalSec: number;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], Item);
	        this.errors = source["errors"];
	        this.unauthorized = source["unauthorized"];
	        this.unreadCount = source["unreadCount"];
	        this.minPollIntervalSec = source["minPollIntervalSec"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

