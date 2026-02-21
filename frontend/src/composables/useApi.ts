import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

export function useApi() {
  return api
}

export default api
