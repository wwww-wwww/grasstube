import {create_modal, modal_set_title, modal_get_body} from "./modals"
import "phoenix_html"

let channel = null
let is_mod = false
let myid = -1

function init(socket, room) {
	console.log("polls: connecting to room " + room)
	channel = socket.channel("polls:" + room, {})
	channel.join()
	.receive("ok", resp => {
		console.log("polls: connected", resp) 
	})
	.receive("error", resp => {
		console.log("polls: failed to connect", resp)
	})

	channel.on("id", data => {
		console.log("polls: id", data)
		myid = data.id
	})

	channel.on("polls", on_get_polls)
	btn_create_poll.addEventListener("click", create_poll_modal)
}

const polls = {}

function on_get_polls(data) {
	console.log("polls: polls", data)
	while (polls_list.firstChild) polls_list.removeChild(polls_list.firstChild)
	for (const poll in polls) delete polls[poll]

	for (const poll in data) polls[poll] = data[poll]

	for (const id in polls) {
		const poll = polls[id]

		poll.e = poll_item_template.cloneNode(true)
		poll.e.id = ""
		poll.e.children[0].children[1].textContent = poll.title

		poll.e.children[0].children[0].classList.toggle("hidden", !is_mod)

		poll.e.children[0].children[0].addEventListener("click", () => {
			channel.push("poll_remove", {id: id})
		})
		
		polls_list.insertBefore(poll.e, polls_list.firstChild)
		
		poll.choices.forEach(choice => {
			const poll_choice = poll_item_choice_template.cloneNode(true)
			poll_choice.id = ""
			poll_choice.children[0].textContent = choice.users.length
			poll_choice.children[0].disabled = choice.users.includes(myid)
			poll_choice.children[1].textContent = choice.name
			poll_choice.children[0].addEventListener("click", () => {
				channel.push("poll_vote", {id: id, choice: choice.name})
			})
			poll.e.children[0].children[2].appendChild(poll_choice)
		})
	}
}

function polls_on_controls() {
	is_mod = true
	btn_create_poll.classList.toggle("hidden", false)
	for (const id in polls) {
		polls[id].e.children[0].children[0].classList.toggle("hidden", false)
	}
}

function create_choice(choices, choices_list) {
	const choice = {}

	choice.e = document.createElement("div")
	choice.e.style.marginTop = "4px"
	choice.e.style.display = "block"

	choice.name = document.createElement("input")
	choice.name.placeholder = "name of choice"
	choice.name.style.marginRight = "4px"
	choice.e.appendChild(choice.name)

	choice.del = document.createElement("button")
	choice.del.textContent = "×"
	choice.del.classList.add("square")

	choice.del.addEventListener("click", () => {
		choices.forEach(c => {
			if (c.del == choice.del) {
				choices_list.removeChild(choice.e)
				choices.splice(choices.indexOf(c), 1)
			}
		})
	})

	choice.e.appendChild(choice.del)

	choices.push(choice)
	choices_list.appendChild(choice.e)
	return choice
}

function create_poll_modal() {
	const modal = create_modal()
	modal_set_title(modal, "create a poll")
	const modal_body = modal_get_body(modal)

	const poll_title = document.createElement("input")
	poll_title.placeholder = "title"
	modal_body.appendChild(poll_title)

	const choices_list = document.createElement("div")
	choices_list.style.marginTop = "4px"
	modal_body.appendChild(choices_list)
	
	const choices = []
	create_choice(choices, choices_list)

	const poll_add_choice = document.createElement("button")
	poll_add_choice.textContent = "add another choice"
	poll_add_choice.style.marginTop = "4px"
	poll_add_choice.style.marginRight = "4px"

	poll_add_choice.addEventListener("click", () => {
		create_choice(choices, choices_list).name.focus()
	})

	modal_body.appendChild(poll_add_choice)

	const poll_create = document.createElement("button")
	poll_create.textContent = "create"
	poll_create.style.float = "right"
	poll_create.style.marginTop = "4px"

	poll_create.addEventListener("click", () => {
		const final_title = poll_title.value.trim()
		if (final_title.length <= 0) return
		if (choices.length <= 0) return

		const final_choices = []
		choices.forEach(e => {
			const choice = e.name.value.trim()
			if (choice.length > 0) {
				final_choices.push(choice)
			}
		})

		if (final_choices.length <= 0) return

		channel.push("poll_add", {title: final_title, choices: final_choices})

		document.body.removeChild(modal)
	})
	
	modal_body.appendChild(poll_create)

	poll_title.focus()
}

export default init
export {polls_on_controls}
