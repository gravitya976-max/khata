import { useState, useEffect, useCallback } from 'react'
import { getAllPeople, addPerson, updatePerson, deletePerson } from '../db'

export default function People() {
  const [people, setPeople] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editPerson, setEditPerson] = useState(null) // null = add, object = edit
  const [formName, setFormName] = useState('')
  const [formMobile, setFormMobile] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)

  const loadPeople = useCallback(async () => {
    const p = await getAllPeople()
    setPeople(p)
  }, [])

  useEffect(() => { loadPeople() }, [loadPeople])

  const filtered = people.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.mobile && p.mobile.includes(search))
  )

  const openAdd = () => {
    setEditPerson(null)
    setFormName('')
    setFormMobile('')
    setShowModal(true)
  }

  const openEdit = (person) => {
    setEditPerson(person)
    setFormName(person.name)
    setFormMobile(person.mobile || '')
    setShowModal(true)
  }

  const handleSave = async () => {
    const name = formName.trim()
    if (!name) return
    if (editPerson) {
      await updatePerson({ ...editPerson, name, mobile: formMobile.trim() })
    } else {
      await addPerson(name, formMobile.trim())
    }
    setShowModal(false)
    await loadPeople()
  }

  const handleDelete = async (id) => {
    await deletePerson(id)
    setShowDeleteConfirm(null)
    await loadPeople()
  }

  return (
    <div>
      {/* Search + Add */}
      <div className="search-bar">
        <i className="fa-solid fa-magnifying-glass"></i>
        <input
          type="text"
          placeholder="Search for Names........."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="add-btn" onClick={openAdd}>
          <i className="fa-solid fa-user-plus"></i> ADD
        </button>
      </div>

      {/* Total Count */}
      <div className="total-count">
        <span>Total Peoples Are</span>
        <span>{people.length}</span>
      </div>

      {/* People List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-user-plus"></i>
          <p>{people.length === 0 ? 'No people added yet.' : 'No results found.'}</p>
        </div>
      ) : (
        filtered.map((person) => (
          <div key={person.id} className="person-card">
            <div className="avatar">
              {person.name.charAt(0).toUpperCase()}
            </div>
            <div className="person-info">
              <div className="name">{person.name}</div>
              {person.mobile && <div className="mobile">{person.mobile}</div>}
            </div>
            <button className="edit-btn" onClick={() => openEdit(person)}>
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
            <button className="delete-btn" onClick={() => setShowDeleteConfirm(person.id)}>
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>
        ))
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editPerson ? 'Edit Person' : 'Add Person'}</h3>
            <div className="modal-field">
              <label>Name *</label>
              <input
                type="text"
                placeholder="Enter full name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label>Mobile (optional)</label>
              <input
                type="tel"
                placeholder="Mobile number"
                value={formMobile}
                onChange={(e) => setFormMobile(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave}>
                {editPerson ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm !== null && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Person</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
              This will delete all collection records for this person. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={() => handleDelete(showDeleteConfirm)}
                style={{ flex: 1 }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
