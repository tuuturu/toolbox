import axios from 'axios'

class AuthorizationError extends Error {
	constructor(...args) {
		super(...args)
	}
}

async function validateToken(url, authorization) {
	if (!authorization) throw new AuthorizationError()

	try {
		const { data } = await axios.request({
			url,
			method: 'get',
			headers: { authorization }
		})

		return data
	}
	catch (error) {
		if (error.response) {
			if (error.response.statusCode === 401) throw new AuthorizationError()
		}

		throw error
	}
}

function setupMiddleware(userinfo_endpoint) {
	return async (req, res, next) => {
		try {
			req.user = await validateToken(userinfo_endpoint, req.headers.authorization)

			req.principal = req.user.sub
		}
		catch (error) {
			return next(error)
		}

		next()
	}
}

export default {
	AuthorizationError,
	authenticationMiddleware: setupMiddleware
}
