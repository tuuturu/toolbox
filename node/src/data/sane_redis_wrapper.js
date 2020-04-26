const redis = require('redis')

function retryStrategy(options) {
	if (options.error && options.error.code === "ECONNREFUSED") {
		// End reconnecting on a specific error and flush all commands with
		// a individual error
		return new Error("The server refused the connection");
	}
	if (options.total_retry_time > 1000 * 60 * 60) {
		// End reconnecting after a specific timeout and flush all commands
		// with a individual error
		return new Error("Retry time exhausted");
	}
	if (options.attempt > 10) {
		// End reconnecting with built in error
		return undefined;
	}
	// reconnect after
	return Math.min(options.attempt * 100, 3000);
}

function appendToCollection(client, prefix, key) {
	return new Promise((resolve, reject) => {
		client.rpush(prefix, key, (error, value) => {
			if (error) reject(error)
			if (!value) reject()

			resolve(value)
		})
	})
}

function removeFromCollection(client, prefix, key) {
	return new Promise((resolve, reject) => {
		client.lrem([prefix, 0, key], (error, value) => {
			if (error) reject(error)
			if (value === 0) reject(new Error('Not found'))

			resolve(value)
		})
	})
}

function getCollection(client, prefix) {
	return new Promise((resolve, reject) => {
		client.lrange(prefix, 0, -1, (error, values) => {
			if (error) reject(error)

			resolve(values)
		})
	})
}

function isLegalObject(obj) {
	Object.keys(obj).forEach(key => {
		if (obj[key] === null || obj[key] === undefined)
			return false
	})

	return true
}

function set(client, prefix, key, obj) {
	return new Promise((resolve, reject) => {
		if (!isLegalObject(obj)) {
			const error = new Error('Object contains illegal value(s)')
			error.body = obj

			return reject(error)
		}

		const true_key = [prefix, key].join(':')

		const destructed = []
		for(let [key, value] of Object.entries(obj))
			if (key && value) destructed.push(key, value)

		client.hmset(true_key, ...destructed, (error, value) => {
			if (error) return reject(error)
			if (!value) return reject()

			removeFromCollection(client, prefix, key)
				.catch(() => {}) // Expected on new value
				.finally(() => {
					appendToCollection(client, prefix, key)
						.then(() => resolve(value))
						.catch(error => reject(error))
				})
		})
	})
}

function get(client, prefix, key) {
	return new Promise((resolve, reject) => {
		const true_key = [prefix, key].join(':')

		client.hgetall(true_key, (error, value) => {
			if (error) reject(error)
			if (!value) reject()

			resolve(value)
		})
	})
}
function getAll(client, prefix) {
	return new Promise(async (resolve, reject) => {
		const operations = []

		const items = await getCollection(client, prefix)
		items.map(item => {
			const true_key = [prefix, item].join(':')

			operations.push(['hgetall', true_key])
		})

		client.multi(operations).exec((error, replies) => {
			if (error) reject(error)

			resolve(replies)
		})
	})
}

function del(client, prefix, key) {
	return new Promise((resolve, reject) => {
		const true_key = [prefix, key].join(':')

		client.del(true_key, (error, value) => {
			if (error) reject(error)
			if (!value || value !== 1) reject()

			removeFromCollection(client, prefix, key)
				.then(() => resolve())
				.catch(error => reject(error))
		})
	})
}

function createNamespace(client, namespace) {
	return {
		del: (key) => del(client, namespace, key),
		get: (key) => get(client, namespace, key),
		getAll: () => getAll(client, namespace),
		set: (key, obj) => set(client, namespace, key, obj),
	}
}

class Client {
	constructor() {
		this.client = null
		this.handlers = {}
	}

	__emit(name, arg) {
		if (!this.handlers[name]) return

		this.handlers[name].forEach(handler => handler.call({}, arg))
	}

	on(name, handler) {
		if (!this.handlers[name]) this.handlers[name] = []

		this.handlers[name].push(handler)
	}

	connect(url) {
		return new Promise((resolve, reject) => {
			this.client = redis.createClient({
				retry_strategy: retryStrategy,
				url
			})

			this.client.on('error', error => {
				this.__emit('error', error)
				reject(error)
			})
			this.client.on('ready', resolve)
		})
	}
	disconnect() {
		return new Promise(resolve => {
			this.client.quit(resolve)
		})
	}

	createCollectionRepository(name) {
		return createNamespace(this.client, name)
	}

	get(collection_name, key) { return get(this.client, collection_name, key) }
	getAll(collection_name) { return getAll(this.client, collection_name) }
	set(collection_name, key, object) { return set(this.client, collection_name, key, object) }
	del(collection_name, key) { return del(this.client, collection_name, key) }
}

module.exports = {
	Client
}
