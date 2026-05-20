import SearchModal from "@modules/search/templates/search-modal"
import { connection } from "next/server"

export default async function SearchModalRoute(){
  await connection()
  return <SearchModal />
}
