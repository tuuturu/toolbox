const util = require('util')
const exec = util.promisify(require('child_process').exec)

const { SaneRedis } = require('../index')

function getRandomPort() {
	const min = 6379
	const max = 7000

	return Math.floor(Math.random() * (max - min)) + min
}

function startRedis() {
	return new Promise(async resolve => {
		const port = getRandomPort()
		const { stdout } = await exec(`docker run --rm -p ${port}:6379 -d redis`)

		setTimeout(() => {
			resolve({ id: stdout, port })
		}, 50)
	})
}

describe('SaneRedisClient', () => {
	const finished_redis = []
	afterAll(() => {
		let instance
		while ((instance = finished_redis.pop()))
			exec(`docker stop ${instance}`)
	})

	it('saves an object and retrieves it successfully', async done => {
		const { id: redisID, port } = await startRedis()

		const client = new SaneRedis.Client()
		await client.connect(`redis://localhost:${port}`)

		const test_person = {
			name: 'Julius',
			age: '31',
			phone: '32642342',
			email: 'willdo@another.com'
		}

		const person = client.createCollectionRepository('person')

		await person.set(test_person.name, test_person)
		const result = await person.get(test_person.name)

		expect(result).toEqual(test_person)

		await client.disconnect()
		finished_redis.push(redisID)
		done()
	})

	it('saves multiple objects and deletes the right one', async done => {
		const { id: redisID, port } = await startRedis()

		const client = new SaneRedis.Client()
		await client.connect(`redis://localhost:${port}`)

		const test_person1 = { name: 'julius', age: '17' }
		const test_person2 = { name: 'benjamin', age: '18' }
		const test_person3 = { name: 'mira craig', age: '19' }

		const person = client.createCollectionRepository('person')

		await Promise.all([
			person.set(test_person1.name, test_person1),
			person.set(test_person2.name, test_person2),
			person.set(test_person3.name, test_person3)
		])

		expect(await person.getAll()).toEqual([
			test_person1,
			test_person2,
			test_person3
		])

		await person.del(test_person2.name)

		expect(await person.getAll()).toEqual([
			test_person1,
			test_person3
		])

		await client.disconnect()
		finished_redis.push(redisID)
		done()
	})

	it('prevents setting an object with a value redis doesnt support', async done => {
		const { id: redisID, port } = await startRedis()

		const client = new SaneRedis.Client()
		await client.connect(`redis://localhost:${port}`)

		const person1 = { name: 'i have a null', age: null }
		const person2 = { name: 'i have an undefined', age: undefined }

		const personRepository = client.createCollectionRepository('person')

		await expect(personRepository.set(person1.name, person1)).rejects
		await expect(personRepository.set(person2.name, person2)).rejects
		await expect(personRepository.getAll()).resolves.toEqual([])

		await client.disconnect()
		finished_redis.push(redisID)
		done()
	})

	it('overwrites the existing object when faced with existing keys', async done => {
		const { id: redisID, port } = await startRedis()

		const client = new SaneRedis.Client()
		await client.connect(`redis://localhost:${port}`)

		const person = { name: 'testname', age: "30" }
		const person_with_change1 = { ...person, phone: '815 493 00' }
		const person_with_change2 = { ...person_with_change1, email: 'horse@cat.dog' }
		const person_id = 'uuid'

		const personRepository = client.createCollectionRepository('person')
		await personRepository.set(person_id, person)

		const result1 = await personRepository.getAll()
		expect(result1).toStrictEqual([{ ...person }])

		await personRepository.set(person_id, person_with_change1)
		const result2 = await personRepository.getAll()
		expect(result2).toStrictEqual([{ ...person_with_change1 }])

		await personRepository.set(person_id, person_with_change2)
		const result3 = await personRepository.getAll()
		expect(result3).toStrictEqual([{ ...person_with_change2 }])

		await client.disconnect()
		finished_redis.push(redisID)
		done()
	})
})
